from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user
from app.routers.biohuertos import _ensure_biohuerto_access
from app.schemas.dashboard import DashboardOut
from app.schemas.users import CurrentUser
from app.services.dashboard_service import build_dashboard

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/{biohuerto_id}", response_model=DashboardOut)
async def get_dashboard(
    biohuerto_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DashboardOut:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    return await build_dashboard(session, biohuerto_id)

