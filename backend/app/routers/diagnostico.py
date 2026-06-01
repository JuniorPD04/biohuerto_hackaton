import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.diagnostico import DiagnosticoGuiadoCreate, DiagnosticoImagenCreate, DiagnosticoOut, DiagnosticoResult
from app.schemas.users import CurrentUser
from app.services.ai_service import diagnostico_guiado, diagnostico_imagen

router = APIRouter(prefix="/api/diagnostico", tags=["diagnostico"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _to_diagnostico_out(row) -> DiagnosticoOut:
    data = dict(row)
    data["sintomas"] = data.get("sintomas") or []
    return DiagnosticoOut.model_validate(data)


async def _validate_scope(
    session: AsyncSession,
    current_user: CurrentUser,
    biohuerto_id: int | None,
    cultivo_id: UUID | None,
) -> None:
    if biohuerto_id is not None:
        await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    if cultivo_id is not None:
        cultivo = await _ensure_cultivo_access(session, cultivo_id, current_user)
        if biohuerto_id is not None and cultivo["biohuerto_id"] != biohuerto_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El cultivo no pertenece al biohuerto indicado",
            )


async def _save_diagnostico(
    *,
    session: AsyncSession,
    current_user: CurrentUser,
    modalidad: str,
    biohuerto_id: int | None,
    cultivo_id: UUID | None,
    especie: str,
    sintomas: list[str],
    zona_afectada: str | None,
    tiempo_dias: int | None,
    result: DiagnosticoResult,
    modelo_usado: str | None,
) -> DiagnosticoOut:
    saved = await session.execute(
        text(
            """
            insert into diagnosticos (
              biohuerto_id, cultivo_id, user_id, modalidad, especie, sintomas,
              zona_afectada, tiempo_dias, resultado_nombre, nivel_riesgo,
              recomendacion_resumen, modelo_usado
            )
            values (
              :biohuerto_id, :cultivo_id, :user_id, :modalidad, :especie, cast(:sintomas as jsonb),
              :zona_afectada, :tiempo_dias, :resultado_nombre, :nivel_riesgo,
              :recomendacion_resumen, :modelo_usado
            )
            returning id, biohuerto_id, cultivo_id, user_id, modalidad, especie, sintomas,
                      zona_afectada, tiempo_dias, resultado_nombre, nivel_riesgo,
                      recomendacion_resumen, modelo_usado, is_synced, created_at, updated_at
            """
        ),
        {
            "biohuerto_id": biohuerto_id,
            "cultivo_id": cultivo_id,
            "user_id": current_user.id,
            "modalidad": modalidad,
            "especie": especie,
            "sintomas": json.dumps(sintomas),
            "zona_afectada": zona_afectada,
            "tiempo_dias": tiempo_dias,
            "resultado_nombre": result.problema,
            "nivel_riesgo": result.nivel_riesgo,
            "recomendacion_resumen": result.recomendacion,
            "modelo_usado": modelo_usado,
        },
    )
    row = saved.mappings().one()
    await session.execute(
        text(
            """
            insert into recomendaciones (diagnostico_id, cultivo_id, titulo, cuerpo, categoria)
            values (:diagnostico_id, :cultivo_id, :titulo, :cuerpo, 'agroecologica')
            """
        ),
        {
            "diagnostico_id": row["id"],
            "cultivo_id": cultivo_id,
            "titulo": result.problema,
            "cuerpo": result.recomendacion + ("\n- " + "\n- ".join(result.acciones) if result.acciones else ""),
        },
    )
    await session.commit()
    return _to_diagnostico_out(row)


@router.post("/guiado", response_model=DiagnosticoOut, status_code=status.HTTP_201_CREATED)
async def create_diagnostico_guiado(
    payload: DiagnosticoGuiadoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> DiagnosticoOut:
    await _validate_scope(session, current_user, payload.biohuerto_id, payload.cultivo_id)
    result, modelo_usado = await diagnostico_guiado(
        especie=payload.especie,
        sintomas=payload.sintomas,
        zona_afectada=payload.zona_afectada,
        tiempo_dias=payload.tiempo_dias,
    )
    return await _save_diagnostico(
        session=session,
        current_user=current_user,
        modalidad="guiado",
        biohuerto_id=payload.biohuerto_id,
        cultivo_id=payload.cultivo_id,
        especie=payload.especie,
        sintomas=payload.sintomas,
        zona_afectada=payload.zona_afectada,
        tiempo_dias=payload.tiempo_dias,
        result=result,
        modelo_usado=modelo_usado,
    )


@router.post("/imagen", response_model=DiagnosticoOut, status_code=status.HTTP_201_CREATED)
async def create_diagnostico_imagen(
    payload: DiagnosticoImagenCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> DiagnosticoOut:
    image_bytes_estimate = len(payload.image_base64) * 3 // 4
    if image_bytes_estimate > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="La imagen supera 5 MB")
    await _validate_scope(session, current_user, payload.biohuerto_id, payload.cultivo_id)
    result, modelo_usado = await diagnostico_imagen(
        especie=payload.especie,
        image_base64=payload.image_base64,
        mime_type=payload.mime_type,
        sintomas=payload.sintomas,
        zona_afectada=payload.zona_afectada,
        tiempo_dias=payload.tiempo_dias,
    )
    return await _save_diagnostico(
        session=session,
        current_user=current_user,
        modalidad="imagen",
        biohuerto_id=payload.biohuerto_id,
        cultivo_id=payload.cultivo_id,
        especie=payload.especie,
        sintomas=payload.sintomas,
        zona_afectada=payload.zona_afectada,
        tiempo_dias=payload.tiempo_dias,
        result=result,
        modelo_usado=modelo_usado,
    )


@router.get("", response_model=list[DiagnosticoOut])
async def list_diagnosticos(
    biohuerto_id: int | None = None,
    cultivo_id: UUID | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DiagnosticoOut]:
    params: dict = {"limit": limit}
    filters = ["deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("user_id = :user_id")
        params["user_id"] = current_user.id
    if biohuerto_id is not None:
        await _ensure_biohuerto_access(session, biohuerto_id, current_user)
        filters.append("biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id
    if cultivo_id is not None:
        await _ensure_cultivo_access(session, cultivo_id, current_user)
        filters.append("cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id

    result = await session.execute(
        text(
            f"""
            select id, biohuerto_id, cultivo_id, user_id, modalidad, especie, sintomas,
                   zona_afectada, tiempo_dias, resultado_nombre, nivel_riesgo,
                   recomendacion_resumen, modelo_usado, is_synced, created_at, updated_at
            from diagnosticos
            where {" and ".join(filters)}
            order by created_at desc
            limit :limit
            """
        ),
        params,
    )
    return [_to_diagnostico_out(row) for row in result.mappings().all()]
