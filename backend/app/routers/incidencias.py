from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.incidencias import IncidenciaCreate, IncidenciaOut, IncidenciaUpdate
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/incidencias", tags=["incidencias"])

_INCIDENCIA_SELECT = """
    select i.id::text as id, i.cultivo_id::text as cultivo_id, ti.nombre as tipo,
           i.descripcion, i.severidad, i.zona_id, z.nombre as zona_afectada,
           i.estado, i.reportado_en,
           e.nombre as cultivo, b.id::text as biohuerto_id, b.nombre as biohuerto
    from incidencias i
    join tipos_incidencia ti on ti.id = i.tipo_id
    left join zonas_planta z on z.id = i.zona_id
    left join cultivos cu on cu.id = i.cultivo_id
    left join especies e on e.id = cu.especie_id
    left join biohuertos b on b.id = cu.biohuerto_id
"""


def _to_incidencia_out(row) -> IncidenciaOut:
    return IncidenciaOut.model_validate(dict(row))


async def _fetch_incidencia(session: AsyncSession, incidencia_id: UUID):
    result = await session.execute(
        text(_INCIDENCIA_SELECT + " where i.id = :id and i.deleted_at is null"),
        {"id": incidencia_id},
    )
    return result.mappings().first()


async def _get_one(session: AsyncSession, incidencia_id: UUID, current_user: CurrentUser) -> IncidenciaOut:
    row = await _fetch_incidencia(session, incidencia_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incidencia no encontrada")
    await _ensure_cultivo_access(session, row["cultivo_id"], current_user)
    return _to_incidencia_out(row)


async def _resolve_tipo_id(session: AsyncSession, tipo: str) -> int:
    result = await session.execute(
        text("select id from tipos_incidencia where lower(nombre) = lower(:tipo)"),
        {"tipo": tipo},
    )
    tipo_id = result.scalar_one_or_none()
    if tipo_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de incidencia no valido: {tipo}",
        )
    return tipo_id


@router.post("", response_model=IncidenciaOut, status_code=status.HTTP_201_CREATED)
async def create_incidencia(
    payload: IncidenciaCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> IncidenciaOut:
    await _ensure_cultivo_access(session, payload.cultivo_id, current_user)
    tipo_id = await _resolve_tipo_id(session, payload.tipo)
    result = await session.execute(
        text(
            """
            insert into incidencias (
              cultivo_id, tipo_id, usuario_id, descripcion, severidad,
              zona_id, estado, reportado_en
            )
            values (
              :cultivo_id, :tipo_id, :usuario_id, :descripcion, :severidad,
              :zona_id, :estado, coalesce(:reportado_en, now())
            )
            returning id
            """
        ),
        {
            "cultivo_id": payload.cultivo_id,
            "tipo_id": tipo_id,
            "usuario_id": current_user.id,
            "descripcion": payload.descripcion,
            "severidad": payload.severidad,
            "zona_id": payload.zona_id,
            "estado": payload.estado,
            "reportado_en": payload.reportado_en,
        },
    )
    new_id = result.scalar_one()
    await session.commit()
    fetched = await session.execute(
        text(_INCIDENCIA_SELECT + " where i.id = :id and i.deleted_at is null"),
        {"id": new_id},
    )
    return _to_incidencia_out(fetched.mappings().one())


@router.get("", response_model=list[IncidenciaOut])
async def list_incidencias(
    cultivo_id: UUID | None = Query(default=None),
    biohuerto_id: str | None = Query(default=None),
    estado: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[IncidenciaOut]:
    where = ["i.deleted_at is null"]
    params: dict = {"limit": limit}
    if cultivo_id is not None:
        where.append("i.cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id
    if biohuerto_id:
        where.append("cu.biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id
    if estado:
        where.append("i.estado = :estado")
        params["estado"] = estado
    result = await session.execute(
        text(
            _INCIDENCIA_SELECT
            + " where " + " and ".join(where)
            + " order by i.reportado_en desc, i.created_at desc limit :limit"
        ),
        params,
    )
    return [_to_incidencia_out(row) for row in result.mappings().all()]


@router.patch("/{incidencia_id}", response_model=IncidenciaOut)
async def update_incidencia(
    incidencia_id: UUID,
    payload: IncidenciaUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> IncidenciaOut:
    await _get_one(session, incidencia_id, current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _get_one(session, incidencia_id, current_user)

    params: dict = {"id": incidencia_id}
    clauses: list[str] = []
    simple_fields = {"descripcion", "severidad", "zona_id", "estado"}
    for field in simple_fields:
        if field in values:
            params[field] = values[field]
            clauses.append(f"{field} = :{field}")
    if "tipo" in values:
        params["tipo_id"] = await _resolve_tipo_id(session, values["tipo"])
        clauses.append("tipo_id = :tipo_id")

    await session.execute(
        text(f"update incidencias set {', '.join(clauses)} where id = :id and deleted_at is null"),
        params,
    )
    await session.commit()
    return await _get_one(session, incidencia_id, current_user)


@router.delete("/{incidencia_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_incidencia(
    incidencia_id: UUID,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _get_one(session, incidencia_id, current_user)
    await session.execute(
        text("update incidencias set deleted_at = now() where id = :id and deleted_at is null"),
        {"id": incidencia_id},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
