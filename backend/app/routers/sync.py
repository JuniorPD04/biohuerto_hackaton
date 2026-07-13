from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.schemas.sync import SyncBootstrapResponse, SyncRequest, SyncResponse, SyncResult
from app.schemas.users import CurrentUser
from app.services.sync_service import apply_operation, bootstrap_data, pull_changes

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/bootstrap", response_model=SyncBootstrapResponse)
async def sync_bootstrap(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SyncBootstrapResponse:
    entities, catalogs, cursor = await bootstrap_data(session, current_user)
    return SyncBootstrapResponse(cursor=cursor, entities=entities, catalogs=catalogs)


@router.post("", response_model=SyncResponse)
async def sync_offline_records(
    payload: SyncRequest,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> SyncResponse:
    results = []
    for operation in payload.operations:
        try:
            async with session.begin_nested():
                results.append(await apply_operation(session, current_user, operation))
        except Exception as exc:
            error = str(exc)[:500] or "Operacion invalida"
            await session.execute(
                text("""
                  insert into sync_operations(
                    operation_uuid,device_uuid,usuario_id,entity_type,record_uuid,action,
                    base_version,status,error_code,client_updated_at
                  ) values(:operation_uuid,:device_uuid,:usuario_id,:entity_type,:record_uuid,:action,
                           :base_version,'rejected','database_validation',:client_updated_at)
                  on conflict(operation_uuid) do nothing
                """),
                {"operation_uuid": operation.operation_id, "device_uuid": operation.device_id,
                 "usuario_id": current_user.id, "entity_type": operation.entity,
                 "record_uuid": operation.record_id, "action": operation.action,
                 "base_version": operation.base_version, "client_updated_at": operation.client_updated_at},
            )
            results.append(SyncResult(
                operation_id=operation.operation_id, entity=operation.entity,
                record_id=operation.record_id, status="rejected", error=error,
            ))
    changes, next_cursor, has_more = await pull_changes(session, current_user, payload.cursor)
    await session.commit()
    return SyncResponse(results=results, changes=changes, next_cursor=next_cursor, has_more=has_more)
