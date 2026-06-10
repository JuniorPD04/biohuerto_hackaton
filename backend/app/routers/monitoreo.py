from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.monitoreo import MonitoreoCreate, MonitoreoOut
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/monitoreo", tags=["monitoreo"])

_LUMINOSIDAD_NIVEL_CASE = """
    case
      when m.luminosidad_lux is null then null
      when m.luminosidad_lux >= 20000 then 'Alta'
      when m.luminosidad_lux >= 10000 then 'Media'
      else 'Baja'
    end as luminosidad_nivel
"""

_MONITOREO_SELECT = f"""
    select m.id, m.cultivo_id, m.fuente, m.sensor_codigo, m.registrado_en,
           m.humedad_pct, m.temperatura_c, m.luminosidad_lux, m.ph_suelo,
           m.observacion,
           {_LUMINOSIDAD_NIVEL_CASE}
    from monitoreo_registros m
"""


def _to_monitoreo_out(row) -> MonitoreoOut:
    return MonitoreoOut.model_validate(dict(row))


@router.post("", response_model=MonitoreoOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=MonitoreoOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_monitoreo(
    payload: MonitoreoCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MonitoreoOut:
    await _ensure_cultivo_access(session, payload.cultivo_id, current_user)
    result = await session.execute(
        text(
            f"""
            with inserted as (
              insert into monitoreo_registros (
                cultivo_id, fuente, usuario_id, humedad_pct, temperatura_c,
                luminosidad_lux, ph_suelo, observacion
              )
              values (
                :cultivo_id, 'manual', :usuario_id, :humedad_pct, :temperatura_c,
                :luminosidad_lux, :ph_suelo, :observacion
              )
              returning id
            )
            {_MONITOREO_SELECT}
            where m.id = (select id from inserted)
            """
        ),
        {
            "cultivo_id": payload.cultivo_id,
            "usuario_id": current_user.id,
            "humedad_pct": payload.humedad_pct,
            "temperatura_c": payload.temperatura_c,
            "luminosidad_lux": payload.luminosidad_lux,
            "ph_suelo": payload.ph_suelo,
            "observacion": payload.observacion,
        },
    )
    row = result.mappings().one()
    await session.commit()
    return _to_monitoreo_out(row)


@router.get("", response_model=list[MonitoreoOut])
async def list_monitoreo(
    cultivo_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[MonitoreoOut]:
    await _ensure_cultivo_access(session, cultivo_id, current_user)
    result = await session.execute(
        text(
            _MONITOREO_SELECT
            + """
            where m.cultivo_id = :cultivo_id and m.deleted_at is null
            order by m.registrado_en desc
            limit 50
            """
        ),
        {"cultivo_id": cultivo_id},
    )
    return [_to_monitoreo_out(row) for row in result.mappings().all()]
