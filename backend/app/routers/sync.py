from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_role
from app.schemas.sync import SyncRequest, SyncResponse
from app.schemas.users import CurrentUser
from app.services.sync_service import sync_registro

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("", response_model=SyncResponse)
async def sync_offline_records(
    payload: SyncRequest,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> SyncResponse:
    sincronizados = 0
    conflictos = []

    for registro in payload.registros:
        conflict = await sync_registro(session, current_user, registro)
        if conflict:
            conflictos.append(conflict)
        else:
            sincronizados += 1

    await session.commit()
    return SyncResponse(sincronizados=sincronizados, conflictos=conflictos)

