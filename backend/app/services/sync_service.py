from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.sync import SyncConflict, SyncRegistro
from app.schemas.users import CurrentUser


async def sync_registro(
    session: AsyncSession,
    current_user: CurrentUser,
    registro: SyncRegistro,
) -> SyncConflict | None:
    if registro.tabla == "monitoreo_registros":
        return await _sync_monitoreo(session, current_user, registro)
    if registro.tabla == "incidencias":
        return await _sync_incidencia(session, current_user, registro)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tabla no soportada")


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


async def _server_wins_conflict(
    session: AsyncSession,
    table: str,
    record_uuid: UUID,
    created_at_local: datetime,
) -> bool:
    result = await session.execute(
        text(f"select updated_at from {table} where id = :id and deleted_at is null"),
        {"id": record_uuid},
    )
    row = result.mappings().first()
    if row is None:
        return False
    server_updated_at = row["updated_at"]
    if server_updated_at.tzinfo is None:
        server_updated_at = server_updated_at.replace(tzinfo=UTC)
    local = created_at_local if created_at_local.tzinfo else created_at_local.replace(tzinfo=UTC)
    return server_updated_at > local


async def _log_sync_queue(
    session: AsyncSession,
    registro: SyncRegistro,
    status_value: str,
    error_message: str | None = None,
) -> None:
    await session.execute(
        text(
            """
            insert into sync_queue (
              tabla, record_uuid, operation, payload, status, error_message,
              created_at_local, processed_at, last_synced_at, is_synced
            )
            values (
              :tabla, :record_uuid, 'upsert', cast(:payload as jsonb), :status,
              :error_message, :created_at_local, now(), now(), :is_synced
            )
            """
        ),
        {
            "tabla": registro.tabla,
            "record_uuid": registro.uuid,
            "payload": registro.model_dump_json(),
            "status": status_value,
            "error_message": error_message,
            "created_at_local": registro.created_at_local,
            "is_synced": status_value == "synced",
        },
    )


async def _sync_monitoreo(
    session: AsyncSession,
    current_user: CurrentUser,
    registro: SyncRegistro,
) -> SyncConflict | None:
    payload = registro.payload
    biohuerto_id = int(payload["biohuerto_id"])
    cultivo_id = UUID(str(payload["cultivo_id"])) if payload.get("cultivo_id") else None
    await _validate_scope(session, current_user, biohuerto_id, cultivo_id)

    if await _server_wins_conflict(session, "monitoreo_registros", registro.uuid, registro.created_at_local):
        await _log_sync_queue(session, registro, "conflict", "server-wins")
        return SyncConflict(tabla=registro.tabla, uuid=registro.uuid, reason="server-wins")

    await session.execute(
        text(
            """
            insert into monitoreo_registros (
              id, biohuerto_id, cultivo_id, user_id, humedad_porcentaje, temperatura_c,
              luminosidad_lux, incidencia, observacion, registrado_en, is_synced, last_synced_at
            )
            values (
              :id, :biohuerto_id, :cultivo_id, :user_id, :humedad_porcentaje, :temperatura_c,
              :luminosidad_lux, :incidencia, :observacion, :registrado_en, true, now()
            )
            on conflict (id) do update set
              humedad_porcentaje = excluded.humedad_porcentaje,
              temperatura_c = excluded.temperatura_c,
              luminosidad_lux = excluded.luminosidad_lux,
              incidencia = excluded.incidencia,
              observacion = excluded.observacion,
              registrado_en = excluded.registrado_en,
              is_synced = true,
              last_synced_at = now()
            """
        ),
        {
            "id": registro.uuid,
            "biohuerto_id": biohuerto_id,
            "cultivo_id": cultivo_id,
            "user_id": current_user.id,
            "humedad_porcentaje": payload.get("humedad_porcentaje"),
            "temperatura_c": payload.get("temperatura_c"),
            "luminosidad_lux": payload.get("luminosidad_lux"),
            "incidencia": payload.get("incidencia"),
            "observacion": payload.get("observacion"),
            "registrado_en": payload.get("registrado_en") or registro.created_at_local,
        },
    )
    await _log_sync_queue(session, registro, "synced")
    return None


async def _sync_incidencia(
    session: AsyncSession,
    current_user: CurrentUser,
    registro: SyncRegistro,
) -> SyncConflict | None:
    payload = registro.payload
    biohuerto_id = int(payload["biohuerto_id"])
    cultivo_id = UUID(str(payload["cultivo_id"])) if payload.get("cultivo_id") else None
    await _validate_scope(session, current_user, biohuerto_id, cultivo_id)

    if await _server_wins_conflict(session, "incidencias", registro.uuid, registro.created_at_local):
        await _log_sync_queue(session, registro, "conflict", "server-wins")
        return SyncConflict(tabla=registro.tabla, uuid=registro.uuid, reason="server-wins")

    await session.execute(
        text(
            """
            insert into incidencias (
              id, biohuerto_id, cultivo_id, user_id, tipo, descripcion, severidad,
              estado, reportado_en, is_synced, last_synced_at
            )
            values (
              :id, :biohuerto_id, :cultivo_id, :user_id, :tipo, :descripcion, :severidad,
              :estado, :reportado_en, true, now()
            )
            on conflict (id) do update set
              tipo = excluded.tipo,
              descripcion = excluded.descripcion,
              severidad = excluded.severidad,
              estado = excluded.estado,
              reportado_en = excluded.reportado_en,
              is_synced = true,
              last_synced_at = now()
            """
        ),
        {
            "id": registro.uuid,
            "biohuerto_id": biohuerto_id,
            "cultivo_id": cultivo_id,
            "user_id": current_user.id,
            "tipo": payload.get("tipo") or "incidencia",
            "descripcion": payload.get("descripcion") or payload.get("incidencia") or "Incidencia offline",
            "severidad": payload.get("severidad") or "media",
            "estado": payload.get("estado") or "abierta",
            "reportado_en": payload.get("reportado_en") or registro.created_at_local,
        },
    )
    await _log_sync_queue(session, registro, "synced")
    return None

