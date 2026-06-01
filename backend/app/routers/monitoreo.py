from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.monitoreo import MonitoreoCreate, MonitoreoOut
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/monitoreo", tags=["monitoreo"])


def _to_monitoreo_out(row) -> MonitoreoOut:
    return MonitoreoOut.model_validate(dict(row))


async def _validate_scope(
    session: AsyncSession,
    current_user: CurrentUser,
    biohuerto_id: int,
    cultivo_id: UUID | None,
) -> None:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    if cultivo_id is not None:
        cultivo = await _ensure_cultivo_access(session, cultivo_id, current_user)
        if cultivo["biohuerto_id"] != biohuerto_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El cultivo no pertenece al biohuerto indicado",
            )


@router.post("", response_model=MonitoreoOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=MonitoreoOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_monitoreo(
    payload: MonitoreoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> MonitoreoOut:
    await _validate_scope(session, current_user, payload.biohuerto_id, payload.cultivo_id)
    result = await session.execute(
        text(
            """
            insert into monitoreo_registros (
              biohuerto_id, cultivo_id, user_id, humedad_porcentaje, temperatura_c,
              luminosidad_lux, incidencia, observacion, registrado_en
            )
            values (
              :biohuerto_id, :cultivo_id, :user_id, :humedad_porcentaje, :temperatura_c,
              :luminosidad_lux, :incidencia, :observacion, :registrado_en
            )
            returning id, biohuerto_id, cultivo_id, user_id, humedad_porcentaje,
                      temperatura_c, luminosidad_lux, incidencia, observacion,
                      registrado_en, is_synced, created_at, updated_at
            """
        ),
        {
            "biohuerto_id": payload.biohuerto_id,
            "cultivo_id": payload.cultivo_id,
            "user_id": current_user.id,
            "humedad_porcentaje": payload.humedad_porcentaje,
            "temperatura_c": payload.temperatura_c,
            "luminosidad_lux": payload.luminosidad_lux,
            "incidencia": payload.incidencia,
            "observacion": payload.observacion,
            "registrado_en": payload.registrado_en or datetime.now(UTC),
        },
    )
    await session.commit()
    return _to_monitoreo_out(result.mappings().one())


@router.get("", response_model=list[MonitoreoOut])
async def list_monitoreo(
    biohuerto_id: int | None = None,
    cultivo_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[MonitoreoOut]:
    params: dict = {"limit": limit}
    filters = ["m.deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("m.user_id = :user_id")
        params["user_id"] = current_user.id
    if biohuerto_id is not None:
        await _ensure_biohuerto_access(session, biohuerto_id, current_user)
        filters.append("m.biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id
    if cultivo_id is not None:
        await _ensure_cultivo_access(session, cultivo_id, current_user)
        filters.append("m.cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id

    result = await session.execute(
        text(
            f"""
            select m.id, m.biohuerto_id, m.cultivo_id, m.user_id, m.humedad_porcentaje,
                   m.temperatura_c, m.luminosidad_lux, m.incidencia, m.observacion,
                   m.registrado_en, m.is_synced, m.created_at, m.updated_at
            from monitoreo_registros m
            where {" and ".join(filters)}
            order by m.registrado_en desc, m.created_at desc
            limit :limit
            """
        ),
        params,
    )
    return [_to_monitoreo_out(row) for row in result.mappings().all()]

