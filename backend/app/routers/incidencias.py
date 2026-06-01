from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.incidencias import IncidenciaCreate, IncidenciaOut
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/incidencias", tags=["incidencias"])


def _to_incidencia_out(row) -> IncidenciaOut:
    return IncidenciaOut.model_validate(dict(row))


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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El cultivo no pertenece al biohuerto")


@router.post("", response_model=IncidenciaOut, status_code=status.HTTP_201_CREATED)
async def create_incidencia(
    payload: IncidenciaCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> IncidenciaOut:
    await _validate_scope(session, current_user, payload.biohuerto_id, payload.cultivo_id)
    result = await session.execute(
        text(
            """
            insert into incidencias (
              biohuerto_id, cultivo_id, user_id, tipo, descripcion, severidad, estado, reportado_en
            )
            values (
              :biohuerto_id, :cultivo_id, :user_id, :tipo, :descripcion, :severidad, :estado, :reportado_en
            )
            returning id, biohuerto_id, cultivo_id, user_id, tipo, descripcion,
                      severidad, estado, reportado_en, is_synced, created_at, updated_at
            """
        ),
        {
            "biohuerto_id": payload.biohuerto_id,
            "cultivo_id": payload.cultivo_id,
            "user_id": current_user.id,
            "tipo": payload.tipo,
            "descripcion": payload.descripcion,
            "severidad": payload.severidad,
            "estado": payload.estado,
            "reportado_en": payload.reportado_en or datetime.now(UTC),
        },
    )
    await session.commit()
    return _to_incidencia_out(result.mappings().one())


@router.get("", response_model=list[IncidenciaOut])
async def list_incidencias(
    biohuerto_id: int | None = None,
    cultivo_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[IncidenciaOut]:
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
            select id, biohuerto_id, cultivo_id, user_id, tipo, descripcion,
                   severidad, estado, reportado_en, is_synced, created_at, updated_at
            from incidencias
            where {" and ".join(filters)}
            order by reportado_en desc, created_at desc
            limit :limit
            """
        ),
        params,
    )
    return [_to_incidencia_out(row) for row in result.mappings().all()]

