import base64
import binascii
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.diagnostico import (
    DiagnosticoAlternativaOut,
    DiagnosticoGuiadoCreate,
    DiagnosticoImagenCreate,
    DiagnosticoOut,
    DiagnosticoResult,
)
from app.schemas.users import CurrentUser
from app.services.ai_service import diagnostico_guiado
from app.services.attachments import principal_image_subquery, set_principal_image
from app.services.plant_disease import diagnosticar_imagen
from app.services.rag import FUENTE as RAG_FUENTE
from app.services.rag import generar_recomendacion

router = APIRouter(prefix="/api/diagnostico", tags=["diagnostico"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024

_DIAGNOSTICO_SELECT = f"""
    select d.id, d.cultivo_id, d.parte_planta,
           d.enfermedad_detectada as resultado, d.nombre_cientifico,
           d.modelo_usado as modelo, d.confianza_pct as confianza,
           d.guardado, d.created_at as fecha,
           {principal_image_subquery("diagnostico_id", "d.id")},
           (select r.cuerpo from recomendaciones r
            where r.diagnostico_id = d.id and r.deleted_at is null
            order by r.created_at desc limit 1) as recomendacion
    from diagnosticos d
"""


async def _fetch_alternativas(session: AsyncSession, diagnostico_id: UUID) -> list[DiagnosticoAlternativaOut]:
    result = await session.execute(
        text(
            """
            select enfermedad, confianza_pct, orden
            from diagnostico_alternativas
            where diagnostico_id = :diagnostico_id
            order by orden asc
            """
        ),
        {"diagnostico_id": diagnostico_id},
    )
    return [DiagnosticoAlternativaOut.model_validate(dict(row)) for row in result.mappings().all()]


async def _to_diagnostico_out(session: AsyncSession, row) -> DiagnosticoOut:
    data = dict(row)
    out = DiagnosticoOut.model_validate(data)
    out.alternativas = await _fetch_alternativas(session, out.id)
    return out


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


async def _insert_recomendacion(
    session: AsyncSession,
    *,
    diagnostico_id: UUID,
    cultivo_id: UUID | None,
    titulo: str,
    recomendacion: str,
    acciones: list[str],
) -> None:
    await session.execute(
        text(
            """
            insert into recomendaciones (
              diagnostico_id, cultivo_id, titulo, cuerpo, categoria, tipo_manejo, origen, fuente
            )
            values (
              :diagnostico_id, :cultivo_id, :titulo, :cuerpo, 'agroecologica', 'organico', 'rag', :fuente
            )
            """
        ),
        {
            "diagnostico_id": diagnostico_id,
            "cultivo_id": cultivo_id,
            "titulo": titulo,
            "cuerpo": recomendacion + ("\n- " + "\n- ".join(acciones) if acciones else ""),
            "fuente": RAG_FUENTE,
        },
    )


async def _save_diagnostico(
    *,
    session: AsyncSession,
    current_user: CurrentUser,
    cultivo_id: UUID | None,
    incidencia_id: UUID | None,
    parte_planta: str | None,
    observaciones_previas: str | None,
    result: DiagnosticoResult,
    modelo_usado: str | None,
    imagen_data_url: str | None = None,
) -> DiagnosticoOut:
    saved = await session.execute(
        text(
            """
            insert into diagnosticos (
              cultivo_id, incidencia_id, usuario_id, parte_planta, observaciones_previas,
              modelo_usado, enfermedad_detectada, nombre_cientifico, confianza_pct, nivel_riesgo
            )
            values (
              :cultivo_id, :incidencia_id, :usuario_id, :parte_planta, :observaciones_previas,
              coalesce(:modelo_usado, 'ResNet50'), :enfermedad_detectada, :nombre_cientifico,
              :confianza_pct, :nivel_riesgo
            )
            returning id
            """
        ),
        {
            "cultivo_id": cultivo_id,
            "incidencia_id": incidencia_id,
            "usuario_id": current_user.id,
            "parte_planta": parte_planta,
            "observaciones_previas": observaciones_previas,
            "modelo_usado": modelo_usado,
            "enfermedad_detectada": result.problema,
            "nombre_cientifico": result.nombre_cientifico,
            "confianza_pct": result.confianza,
            "nivel_riesgo": result.nivel_riesgo,
        },
    )
    diagnostico_id = saved.scalar_one()

    for orden, alternativa in enumerate(result.alternativas, start=1):
        await session.execute(
            text(
                """
                insert into diagnostico_alternativas (diagnostico_id, enfermedad, confianza_pct, orden)
                values (:diagnostico_id, :enfermedad, :confianza_pct, :orden)
                """
            ),
            {
                "diagnostico_id": diagnostico_id,
                "enfermedad": alternativa.enfermedad,
                "confianza_pct": alternativa.confianza,
                "orden": orden,
            },
        )

    if result.recomendacion:
        await _insert_recomendacion(
            session,
            diagnostico_id=diagnostico_id,
            cultivo_id=cultivo_id,
            titulo=result.problema,
            recomendacion=result.recomendacion,
            acciones=result.acciones,
        )

    if imagen_data_url:
        await set_principal_image(
            session, column="diagnostico_id", entity_id=diagnostico_id, data_url=imagen_data_url
        )

    await session.commit()

    fetched = await session.execute(
        text(_DIAGNOSTICO_SELECT + " where d.id = :id and d.deleted_at is null"),
        {"id": diagnostico_id},
    )
    return await _to_diagnostico_out(session, fetched.mappings().one())


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
        parte_planta=payload.parte_planta,
        observaciones=payload.observaciones_previas,
    )
    return await _save_diagnostico(
        session=session,
        current_user=current_user,
        cultivo_id=payload.cultivo_id,
        incidencia_id=payload.incidencia_id,
        parte_planta=payload.parte_planta,
        observaciones_previas=payload.observaciones_previas,
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
    if payload.cultivo_id is not None:
        await _ensure_cultivo_access(session, payload.cultivo_id, current_user)

    try:
        image_bytes = base64.b64decode(payload.image_base64, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Imagen inválida.") from exc

    result, modelo_usado = await diagnosticar_imagen(image_bytes)

    return await _save_diagnostico(
        session=session,
        current_user=current_user,
        cultivo_id=payload.cultivo_id,
        incidencia_id=None,
        parte_planta=payload.parte_planta,
        observaciones_previas=None,
        result=result,
        modelo_usado=modelo_usado,
        imagen_data_url=f"data:{payload.mime_type};base64,{payload.image_base64}",
    )


@router.get("", response_model=list[DiagnosticoOut])
async def list_diagnosticos(
    cultivo_id: UUID | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DiagnosticoOut]:
    params: dict = {"limit": limit}
    filters = ["d.deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("d.usuario_id = :usuario_id")
        params["usuario_id"] = current_user.id
    if cultivo_id is not None:
        await _ensure_cultivo_access(session, cultivo_id, current_user)
        filters.append("d.cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id

    result = await session.execute(
        text(
            _DIAGNOSTICO_SELECT
            + f"""
            where {" and ".join(filters)}
            order by d.created_at desc
            limit :limit
            """
        ),
        params,
    )
    return [await _to_diagnostico_out(session, row) for row in result.mappings().all()]


@router.post("/{diagnostico_id}/recomendacion", response_model=DiagnosticoOut)
async def create_recomendacion(
    diagnostico_id: UUID,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> DiagnosticoOut:
    filters = ["d.id = :id", "d.deleted_at is null"]
    params: dict = {"id": diagnostico_id}
    if current_user.rol != "admin":
        filters.append("d.usuario_id = :usuario_id")
        params["usuario_id"] = current_user.id

    fetched = await session.execute(text(_DIAGNOSTICO_SELECT + f" where {' and '.join(filters)}"), params)
    row = fetched.mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnóstico no encontrado")

    es_sano = (row["resultado"] or "").startswith("Planta sana")
    if row["recomendacion"] or es_sano:
        return await _to_diagnostico_out(session, row)

    result = DiagnosticoResult(
        problema=row["resultado"] or "",
        nombre_cientifico=row["nombre_cientifico"],
        es_sano=False,
    )
    recomendacion, acciones = await generar_recomendacion(session, result)
    if recomendacion:
        await _insert_recomendacion(
            session,
            diagnostico_id=diagnostico_id,
            cultivo_id=row["cultivo_id"],
            titulo=row["resultado"] or "",
            recomendacion=recomendacion,
            acciones=acciones,
        )
        await session.commit()

    fetched = await session.execute(text(_DIAGNOSTICO_SELECT + " where d.id = :id"), {"id": diagnostico_id})
    return await _to_diagnostico_out(session, fetched.mappings().one())
