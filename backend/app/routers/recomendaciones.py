from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.recomendaciones import RecomendacionOut
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/recomendaciones", tags=["recomendaciones"])


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
        filters.append("(c.user_id = :user_id or d.user_id = :user_id or (r.cultivo_id is null and r.diagnostico_id is null))")
        params["user_id"] = current_user.id

    result = await session.execute(
        text(
            f"""
            select r.id, r.diagnostico_id, r.cultivo_id, r.titulo, r.cuerpo,
                   r.categoria, r.created_at, r.updated_at
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

