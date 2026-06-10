from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.alertas import AlertaCreate, AlertaOut, AlertasUnseenCount, AlertaUpdate
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/alertas", tags=["alertas"])

_PRIORIDAD_TO_INT = {"baja": 1, "media": 2, "alta": 3}

_ALERTA_SELECT = """
    select a.id, t.nombre as tipo, a.titulo, a.descripcion,
           a.cultivo_id, c.especie as cultivo,
           a.biohuerto_id, b.nombre as biohuerto,
           case a.prioridad when 1 then 'baja' when 3 then 'alta' else 'media' end as prioridad,
           a.estado, a.fecha_programada, a.es_automatica, a.vista,
           a.created_at, a.updated_at
    from alertas a
    join tipos_alerta t on t.id = a.tipo_id
    left join cultivos c on c.id = a.cultivo_id
    left join biohuertos b on b.id = a.biohuerto_id
"""


def _to_alerta_out(row) -> AlertaOut:
    return AlertaOut.model_validate(dict(row))


async def _generate_cuidado_alerts(session: AsyncSession, current_user: CurrentUser) -> None:
    filters = ["c.activo", "c.deleted_at is null"]
    params: dict = {}
    if current_user.rol != "admin":
        filters.append("cu.usuario_id = :usuario_id")
        params["usuario_id"] = current_user.id

    await session.execute(
        text(
            f"""
            insert into alertas (
              cultivo_id, usuario_id, tipo_id, titulo, descripcion,
              prioridad, estado, fecha_programada, es_automatica, cuidado_id, vista
            )
            select cu.id, cu.usuario_id, c.tipo_id,
                   t.nombre || ': ' || cu.especie,
                   coalesce(c.descripcion, t.nombre || ' programado cada ' || c.frecuencia_dias || ' dias'),
                   2, 'pendiente',
                   coalesce(c.ultima_realizada, c.created_at) + (c.frecuencia_dias || ' days')::interval,
                   true, c.id, false
            from cuidados c
            join cultivos cu on cu.id = c.cultivo_id
            join tipos_alerta t on t.id = c.tipo_id
            where {" and ".join(filters)}
              and coalesce(c.ultima_realizada, c.created_at) + (c.frecuencia_dias || ' days')::interval <= now()
            on conflict (cuidado_id) where estado = 'pendiente' and deleted_at is null
            do nothing
            """
        ),
        params,
    )
    await session.commit()


async def _fetch_alerta(session: AsyncSession, alerta_id: int):
    result = await session.execute(
        text(_ALERTA_SELECT + " where a.id = :id and a.deleted_at is null"),
        {"id": alerta_id},
    )
    return result.mappings().first()


async def _get_one(session: AsyncSession, alerta_id: int) -> AlertaOut:
    row = await _fetch_alerta(session, alerta_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")
    return _to_alerta_out(row)


@router.get("/unseen-count", response_model=AlertasUnseenCount)
async def unseen_count(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AlertasUnseenCount:
    await _generate_cuidado_alerts(session, current_user)
    params: dict = {}
    filters = ["a.deleted_at is null", "a.vista = false", "a.estado = 'pendiente'"]
    if current_user.rol != "admin":
        filters.append("(a.usuario_id = :uid or a.usuario_id is null)")
        params["uid"] = current_user.id
    result = await session.execute(
        text(f"select count(*) from alertas a where {' and '.join(filters)}"),
        params,
    )
    return AlertasUnseenCount(count=result.scalar_one())


@router.post("/mark-seen", status_code=status.HTTP_204_NO_CONTENT)
async def mark_seen(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    params: dict = {}
    filters = ["deleted_at is null", "vista = false"]
    if current_user.rol != "admin":
        filters.append("(usuario_id = :uid or usuario_id is null)")
        params["uid"] = current_user.id
    await session.execute(
        text(f"update alertas set vista = true where {' and '.join(filters)}"),
        params,
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("", response_model=list[AlertaOut])
async def list_alertas(
    estado: str | None = None,
    cultivo_id: UUID | None = None,
    biohuerto_id: int | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[AlertaOut]:
    await _generate_cuidado_alerts(session, current_user)
    params: dict = {}
    filters = ["a.deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("(a.usuario_id = :uid or a.usuario_id is null)")
        params["uid"] = current_user.id
    if estado is not None:
        filters.append("a.estado = :estado")
        params["estado"] = estado
    if cultivo_id is not None:
        filters.append("a.cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id
    if biohuerto_id is not None:
        filters.append("a.biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id

    result = await session.execute(
        text(_ALERTA_SELECT + " where " + " and ".join(filters) + " order by a.fecha_programada desc"),
        params,
    )
    return [_to_alerta_out(row) for row in result.mappings().all()]


@router.post("", response_model=AlertaOut, status_code=status.HTTP_201_CREATED)
async def create_alerta(
    payload: AlertaCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> AlertaOut:
    if payload.cultivo_id is not None:
        await _ensure_cultivo_access(session, payload.cultivo_id, current_user)
    if payload.biohuerto_id is not None:
        await _ensure_biohuerto_access(session, payload.biohuerto_id, current_user)

    result = await session.execute(
        text(
            """
            insert into alertas (
              cultivo_id, biohuerto_id, usuario_id, tipo_id, titulo, descripcion,
              prioridad, estado, fecha_programada
            )
            values (
              :cultivo_id, :biohuerto_id, :usuario_id,
              (select id from tipos_alerta where nombre = :tipo),
              :titulo, :descripcion, :prioridad, 'pendiente', :fecha_programada
            )
            returning id
            """
        ),
        {
            "cultivo_id": payload.cultivo_id,
            "biohuerto_id": payload.biohuerto_id,
            "usuario_id": current_user.id,
            "tipo": payload.tipo,
            "titulo": payload.titulo,
            "descripcion": payload.descripcion,
            "prioridad": _PRIORIDAD_TO_INT[payload.prioridad],
            "fecha_programada": payload.fecha_programada,
        },
    )
    new_id = result.scalar_one()
    await session.commit()
    return await _get_one(session, new_id)


@router.get("/{alerta_id}", response_model=AlertaOut)
async def get_alerta(
    alerta_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AlertaOut:
    return await _get_one(session, alerta_id)


@router.patch("/{alerta_id}", response_model=AlertaOut)
async def update_alerta(
    alerta_id: int,
    payload: AlertaUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> AlertaOut:
    await _get_one(session, alerta_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _get_one(session, alerta_id)

    params: dict = {"id": alerta_id}
    clauses: list[str] = []
    simple_fields = {"titulo", "descripcion", "estado", "fecha_programada"}
    for field in simple_fields:
        if field in values:
            params[field] = values[field]
            clauses.append(f"{field} = :{field}")
    if "tipo" in values:
        params["tipo"] = values["tipo"]
        clauses.append("tipo_id = (select id from tipos_alerta where nombre = :tipo)")
    if "prioridad" in values:
        params["prioridad"] = _PRIORIDAD_TO_INT[values["prioridad"]]
        clauses.append("prioridad = :prioridad")

    await session.execute(
        text(f"update alertas set {', '.join(clauses)} where id = :id and deleted_at is null"),
        params,
    )
    await session.commit()
    return await _get_one(session, alerta_id)


@router.delete("/{alerta_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alerta(
    alerta_id: int,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _get_one(session, alerta_id)
    await session.execute(
        text("update alertas set deleted_at = now() where id = :id and deleted_at is null"),
        {"id": alerta_id},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
