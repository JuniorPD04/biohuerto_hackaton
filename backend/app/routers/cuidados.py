from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.cuidados import CuidadoCreate, CuidadoOut, CuidadoUpdate
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/cuidados", tags=["cuidados"])

_CUIDADO_SELECT = """
    select c.id, c.cultivo_id, t.nombre as tipo, c.descripcion, c.frecuencia_dias,
           c.ultima_realizada, c.activo,
           coalesce(c.ultima_realizada, c.created_at) + (c.frecuencia_dias || ' days')::interval as proxima_fecha,
           c.activo and coalesce(c.ultima_realizada, c.created_at) + (c.frecuencia_dias || ' days')::interval <= now() as vencido
    from cuidados c
    join tipos_alerta t on t.id = c.tipo_id
"""


def _to_cuidado_out(row) -> CuidadoOut:
    return CuidadoOut.model_validate(dict(row))


async def _resolve_tipo_id(session: AsyncSession, tipo: str) -> int:
    result = await session.execute(
        text("select id from tipos_alerta where lower(nombre) = lower(:tipo)"),
        {"tipo": tipo},
    )
    tipo_id = result.scalar_one_or_none()
    if tipo_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tipo de cuidado no valido: {tipo}")
    return tipo_id


async def _fetch_cuidado(session: AsyncSession, cuidado_id: UUID):
    result = await session.execute(
        text(_CUIDADO_SELECT + " where c.id = :id and c.deleted_at is null"),
        {"id": cuidado_id},
    )
    return result.mappings().first()


async def _get_one(session: AsyncSession, cuidado_id: UUID, current_user: CurrentUser) -> CuidadoOut:
    row = await _fetch_cuidado(session, cuidado_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuidado no encontrado")
    await _ensure_cultivo_access(session, row["cultivo_id"], current_user)
    return _to_cuidado_out(row)


@router.get("", response_model=list[CuidadoOut])
async def list_cuidados(
    cultivo_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CuidadoOut]:
    await _ensure_cultivo_access(session, cultivo_id, current_user)
    result = await session.execute(
        text(
            _CUIDADO_SELECT
            + """
            where c.cultivo_id = :cultivo_id and c.deleted_at is null
            order by c.created_at desc
            """
        ),
        {"cultivo_id": cultivo_id},
    )
    return [_to_cuidado_out(row) for row in result.mappings().all()]


@router.post("", response_model=CuidadoOut, status_code=status.HTTP_201_CREATED)
async def create_cuidado(
    payload: CuidadoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CuidadoOut:
    await _ensure_cultivo_access(session, payload.cultivo_id, current_user)
    tipo_id = await _resolve_tipo_id(session, payload.tipo)
    result = await session.execute(
        text(
            """
            insert into cuidados (cultivo_id, tipo_id, descripcion, frecuencia_dias)
            values (:cultivo_id, :tipo_id, :descripcion, :frecuencia_dias)
            returning id
            """
        ),
        {
            "cultivo_id": payload.cultivo_id,
            "tipo_id": tipo_id,
            "descripcion": payload.descripcion,
            "frecuencia_dias": payload.frecuencia_dias,
        },
    )
    new_id = result.scalar_one()
    await session.commit()
    return await _get_one(session, new_id, current_user)


@router.patch("/{cuidado_id}", response_model=CuidadoOut)
async def update_cuidado(
    cuidado_id: UUID,
    payload: CuidadoUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CuidadoOut:
    await _get_one(session, cuidado_id, current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _get_one(session, cuidado_id, current_user)

    params: dict = {"id": cuidado_id}
    clauses: list[str] = ["updated_at = now()"]
    if "tipo" in values:
        params["tipo_id"] = await _resolve_tipo_id(session, values["tipo"])
        clauses.append("tipo_id = :tipo_id")
    for field in ("descripcion", "frecuencia_dias", "activo"):
        if field in values:
            params[field] = values[field]
            clauses.append(f"{field} = :{field}")

    await session.execute(
        text(f"update cuidados set {', '.join(clauses)} where id = :id and deleted_at is null"),
        params,
    )
    await session.commit()
    return await _get_one(session, cuidado_id, current_user)


@router.post("/{cuidado_id}/realizado", response_model=CuidadoOut)
async def marcar_realizado(
    cuidado_id: UUID,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CuidadoOut:
    await _get_one(session, cuidado_id, current_user)
    await session.execute(
        text("update cuidados set ultima_realizada = now(), updated_at = now() where id = :id and deleted_at is null"),
        {"id": cuidado_id},
    )
    await session.execute(
        text(
            """
            update alertas set estado = 'completada', vista = true
            where cuidado_id = :id and estado = 'pendiente' and deleted_at is null
            """
        ),
        {"id": cuidado_id},
    )
    await session.commit()
    return await _get_one(session, cuidado_id, current_user)


@router.delete("/{cuidado_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cuidado(
    cuidado_id: UUID,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _get_one(session, cuidado_id, current_user)
    await session.execute(
        text("update cuidados set deleted_at = now() where id = :id and deleted_at is null"),
        {"id": cuidado_id},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
