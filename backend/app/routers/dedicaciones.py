from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.schemas.dedicaciones import DedicacionCreate, DedicacionOut, DedicacionResumen
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/dedicaciones", tags=["dedicaciones"])

_SELECT = """
    select d.id::text as id, d.biohuerto_id::text as biohuerto_id, b.nombre as biohuerto,
           d.usuario_id, us.nombre as usuario,
           d.actividad_id, ac.nombre as actividad,
           d.fecha, d.horas, d.observacion, d.created_at
    from dedicaciones d
    join biohuertos b on b.id = d.biohuerto_id
    join usuarios us on us.id = d.usuario_id
    join actividades ac on ac.id = d.actividad_id
"""


@router.post("", response_model=DedicacionOut, status_code=status.HTTP_201_CREATED)
async def create_dedicacion(
    payload: DedicacionCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> DedicacionOut:
    await _ensure_biohuerto_access(session, payload.biohuerto_id, current_user)
    result = await session.execute(
        text(
            """
            insert into dedicaciones (biohuerto_id, usuario_id, actividad_id, fecha, horas, observacion)
            values (:biohuerto_id, :usuario_id, :actividad_id, :fecha, :horas, :observacion)
            returning id
            """
        ),
        {
            "biohuerto_id": payload.biohuerto_id,
            "usuario_id": current_user.id,
            "actividad_id": payload.actividad_id,
            "fecha": payload.fecha,
            "horas": payload.horas,
            "observacion": payload.observacion,
        },
    )
    new_id = result.scalar_one()
    await session.commit()
    row = await session.execute(text(_SELECT + " where d.id = :id"), {"id": new_id})
    return DedicacionOut.model_validate(dict(row.mappings().one()))


@router.get("", response_model=list[DedicacionOut])
async def list_dedicaciones(
    biohuerto_id: str | None = Query(default=None),
    usuario_id: int | None = Query(default=None),
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DedicacionOut]:
    filters = ["d.deleted_at is null"]
    params: dict = {"limit": limit}
    # El productor solo ve sus propias dedicaciones; el admin, todas.
    if current_user.rol != "admin":
        filters.append("d.usuario_id = :usuario_id")
        params["usuario_id"] = current_user.id
    elif usuario_id is not None:
        filters.append("d.usuario_id = :usuario_id")
        params["usuario_id"] = usuario_id
    if biohuerto_id:
        filters.append("d.biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id
    if fecha_desde is not None:
        filters.append("d.fecha >= :fecha_desde")
        params["fecha_desde"] = fecha_desde
    if fecha_hasta is not None:
        filters.append("d.fecha <= :fecha_hasta")
        params["fecha_hasta"] = fecha_hasta

    result = await session.execute(
        text(
            _SELECT
            + " where "
            + " and ".join(filters)
            + " order by d.fecha desc, d.created_at desc limit :limit"
        ),
        params,
    )
    return [DedicacionOut.model_validate(dict(row)) for row in result.mappings().all()]


@router.get("/resumen", response_model=DedicacionResumen)
async def resumen_dedicaciones(
    biohuerto_id: UUID = Query(...),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DedicacionResumen:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    row = (
        await session.execute(
            text(
                """
                select coalesce(sum(horas), 0) as total_horas,
                       count(distinct usuario_id) as personas
                from dedicaciones
                where biohuerto_id = :id and deleted_at is null
                """
            ),
            {"id": biohuerto_id},
        )
    ).mappings().one()
    return DedicacionResumen(
        biohuerto_id=str(biohuerto_id),
        total_horas=Decimal(str(row["total_horas"] or 0)),
        personas=int(row["personas"] or 0),
    )
