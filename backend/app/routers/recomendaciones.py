from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.recomendaciones import RecomendacionCreate, RecomendacionOut, RecomendacionUpdate
from app.schemas.users import CurrentUser
from app.services.rag import generar_recomendacion_cultivo

router = APIRouter(prefix="/api/recomendaciones", tags=["recomendaciones"])

_RECOMENDACION_SELECT = """
    select r.id, r.cultivo_id, r.diagnostico_id, r.titulo,
           r.cuerpo as descripcion, r.categoria, r.tipo_manejo as tipo,
           r.prioridad, r.aplicada, r.created_at as fecha
    from recomendaciones r
"""


def _to_recomendacion_out(row) -> RecomendacionOut:
    return RecomendacionOut.model_validate(dict(row))


@router.get("", response_model=list[RecomendacionOut])
async def list_recomendaciones(
    cultivo_id: UUID | None = None,
    diagnostico_id: UUID | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[RecomendacionOut]:
    params: dict = {"limit": limit}
    filters = ["r.deleted_at is null"]
    if cultivo_id is not None:
        await _ensure_cultivo_access(session, cultivo_id, current_user)
        filters.append("r.cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id
    if diagnostico_id is not None:
        filters.append("r.diagnostico_id = :diagnostico_id")
        params["diagnostico_id"] = diagnostico_id
    if current_user.rol != "admin":
        filters.append(
            "(c.usuario_id = :usuario_id or d.usuario_id = :usuario_id "
            "or (r.cultivo_id is null and r.diagnostico_id is null))"
        )
        params["usuario_id"] = current_user.id

    result = await session.execute(
        text(
            f"""
            select r.id, r.cultivo_id, r.diagnostico_id, r.titulo,
                   r.cuerpo as descripcion, r.categoria, r.tipo_manejo as tipo,
                   r.prioridad, r.aplicada, r.created_at as fecha
            from recomendaciones r
            left join cultivos c on c.id = r.cultivo_id
            left join diagnosticos d on d.id = r.diagnostico_id
            where {" and ".join(filters)}
            order by r.created_at desc
            limit :limit
            """
        ),
        params,
    )
    return [_to_recomendacion_out(row) for row in result.mappings().all()]


@router.post("", response_model=RecomendacionOut, status_code=status.HTTP_201_CREATED)
async def create_recomendacion(
    payload: RecomendacionCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> RecomendacionOut:
    if payload.cultivo_id is not None:
        await _ensure_cultivo_access(session, payload.cultivo_id, current_user)
    result = await session.execute(
        text(
            """
            insert into recomendaciones (
              cultivo_id, diagnostico_id, titulo, cuerpo, prioridad,
              categoria, tipo_manejo, fuente, origen
            )
            values (
              :cultivo_id, :diagnostico_id, :titulo, :cuerpo, :prioridad,
              :categoria, :tipo_manejo, :fuente, 'manual'
            )
            returning id
            """
        ),
        {
            "cultivo_id": payload.cultivo_id,
            "diagnostico_id": payload.diagnostico_id,
            "titulo": payload.titulo,
            "cuerpo": payload.cuerpo,
            "prioridad": payload.prioridad,
            "categoria": payload.categoria,
            "tipo_manejo": payload.tipo_manejo,
            "fuente": payload.fuente,
        },
    )
    new_id = result.scalar_one()
    await session.commit()
    fetched = await session.execute(
        text(_RECOMENDACION_SELECT + " where r.id = :id and r.deleted_at is null"),
        {"id": new_id},
    )
    return _to_recomendacion_out(fetched.mappings().one())


@router.post("/cultivo/{cultivo_id}/general", response_model=RecomendacionOut, status_code=status.HTTP_201_CREATED)
async def create_recomendacion_general(
    cultivo_id: UUID,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> RecomendacionOut:
    cultivo = await _ensure_cultivo_access(session, cultivo_id, current_user)

    recomendacion, acciones = await generar_recomendacion_cultivo(
        especie=cultivo["especie"],
        variedad=cultivo["variedad"],
        etapa_nombre=cultivo["etapa_nombre"],
    )
    if not recomendacion:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo generar la recomendación ahora. Inténtalo más tarde.",
        )

    cuerpo = recomendacion + ("\n- " + "\n- ".join(acciones) if acciones else "")
    result = await session.execute(
        text(
            """
            insert into recomendaciones (
              cultivo_id, titulo, cuerpo, categoria, tipo_manejo, origen, fuente
            )
            values (
              :cultivo_id, :titulo, :cuerpo, 'Cuidado general', 'cultural', 'rag', :fuente
            )
            returning id
            """
        ),
        {
            "cultivo_id": cultivo_id,
            "titulo": f"Cuidados generales: {cultivo['especie']}",
            "cuerpo": cuerpo,
            "fuente": "IA - recomendacion general (Ollama)",
        },
    )
    new_id = result.scalar_one()
    await session.commit()
    fetched = await session.execute(
        text(_RECOMENDACION_SELECT + " where r.id = :id and r.deleted_at is null"),
        {"id": new_id},
    )
    return _to_recomendacion_out(fetched.mappings().one())


@router.patch("/{recomendacion_id}", response_model=RecomendacionOut)
async def update_recomendacion(
    recomendacion_id: int,
    payload: RecomendacionUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> RecomendacionOut:
    fetched = await session.execute(
        text(
            """
            select r.id, r.cultivo_id, r.diagnostico_id, c.usuario_id as cultivo_usuario_id,
                   d.usuario_id as diagnostico_usuario_id
            from recomendaciones r
            left join cultivos c on c.id = r.cultivo_id
            left join diagnosticos d on d.id = r.diagnostico_id
            where r.id = :id and r.deleted_at is null
            """
        ),
        {"id": recomendacion_id},
    )
    row = fetched.mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recomendación no encontrada")

    if current_user.rol != "admin":
        owners = {row["cultivo_usuario_id"], row["diagnostico_usuario_id"]}
        if current_user.id not in owners:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso a esta recomendación")

    await session.execute(
        text(
            """
            update recomendaciones
            set aplicada = :aplicada,
                aplicada_en = case when :aplicada then now() else null end
            where id = :id
            """
        ),
        {"id": recomendacion_id, "aplicada": payload.aplicada},
    )
    await session.commit()

    fetched = await session.execute(
        text(_RECOMENDACION_SELECT + " where r.id = :id and r.deleted_at is null"),
        {"id": recomendacion_id},
    )
    return _to_recomendacion_out(fetched.mappings().one())
