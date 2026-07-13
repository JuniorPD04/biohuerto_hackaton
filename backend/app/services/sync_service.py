from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.services.attachments import set_principal_image
from app.schemas.sync import SyncChange, SyncOperation, SyncResult
from app.schemas.users import CurrentUser

ENTITY_FIELDS: dict[str, set[str]] = {
    "biohuertos": {"tipo_area_id", "codigo", "abreviatura", "nombre", "descripcion", "latitud", "longitud", "area_m2", "estado", "grid_filas", "grid_columnas", "is_active"},
    "cultivos": {"biohuerto_id", "campania_id", "etapa_id", "especie_id", "variedad", "fecha_siembra", "fecha_estimada_cosecha", "cantidad", "unidad_id", "area_m2", "celda_fila", "celda_columna", "notas", "is_active"},
    "monitoreo_registros": {"cultivo_id", "fuente_id", "sensor_codigo", "registrado_en", "humedad_pct", "temperatura_c", "luminosidad_lux", "ph_suelo", "observacion", "nota_ajuste"},
    "incidencias": {"cultivo_id", "tipo_id", "descripcion", "severidad", "zona_id", "estado", "reportado_en"},
    "cuidados": {"cultivo_id", "tipo_id", "descripcion", "frecuencia_dias", "ultima_realizada", "is_active"},
    "practicas_agricolas": {"cultivo_id", "tipo_id", "descripcion", "insumo_id", "cantidad", "unidad_id", "fecha_aplicacion"},
    "costos_produccion": {"cultivo_id", "categoria_id", "descripcion", "cantidad", "unidad_id", "monto", "moneda", "fecha"},
    "cosechas": {"cultivo_id", "nombre_producto", "cantidad", "unidad_id", "precio_referencial", "fecha_cosecha", "link_whatsapp", "estado", "published_at"},
}
USER_COLUMN = {
    "cultivos": "usuario_id",
    "monitoreo_registros": "usuario_id",
    "incidencias": "usuario_id",
    "practicas_agricolas": "usuario_id",
    "costos_produccion": "usuario_id",
    "cosechas": "usuario_id",
}
SYNC_ENTITIES = tuple(ENTITY_FIELDS)


async def _record(session: AsyncSession, entity: str, record_id: UUID) -> dict[str, Any] | None:
    hidden = " - 'telefono_encrypted' - 'ubicacion_referencia_encrypted'"
    result = await session.execute(
        text(f"select to_jsonb(t){hidden} as record from {entity} t where id=:id"),
        {"id": record_id},
    )
    return result.scalar_one_or_none()


async def _current_version(session: AsyncSession, entity: str, record_id: UUID) -> int | None:
    result = await session.execute(text(f"select sync_version from {entity} where id=:id"), {"id": record_id})
    return result.scalar_one_or_none()


async def _validate_access(
    session: AsyncSession, current_user: CurrentUser, entity: str,
    record_id: UUID, payload: dict[str, Any], creating: bool = False,
) -> None:
    if current_user.rol == "admin":
        return
    if entity == "biohuertos":
        if not creating:
            await _ensure_biohuerto_access(session, record_id, current_user)
        return
    if entity == "cultivos":
        if creating:
            await _ensure_biohuerto_access(session, UUID(str(payload["biohuerto_id"])), current_user)
        else:
            await _ensure_cultivo_access(session, record_id, current_user)
        return
    cultivo_id = payload.get("cultivo_id")
    if not cultivo_id and not creating:
        result = await session.execute(text(f"select cultivo_id from {entity} where id=:id"), {"id": record_id})
        cultivo_id = result.scalar_one_or_none()
    if cultivo_id:
        await _ensure_cultivo_access(session, UUID(str(cultivo_id)), current_user)
        return
    if entity == "cosechas" and not creating:
        result = await session.execute(text("select usuario_id from cosechas where id=:id"), {"id": record_id})
        if result.scalar_one_or_none() == current_user.id:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registro fuera del alcance del usuario")


async def _prepare_payload(
    session: AsyncSession, entity: str, payload: dict[str, Any], record_id: UUID,
) -> dict[str, Any]:
    values = dict(payload)
    if entity == "biohuertos":
        if not values.get("tipo_area_id"):
            result = await session.execute(text("select id from tipos_area where lower(nombre)='biohuerto' order by id limit 1"))
            values["tipo_area_id"] = result.scalar_one_or_none() or 1
        values.setdefault("codigo", f"BH-{str(record_id)[:6].upper()}")
        values.setdefault("estado", "nuevo")
    elif entity == "cultivos":
        if not values.get("etapa_id") and values.get("etapa"):
            result = await session.execute(text("select id from etapas_fenologicas where codigo=:codigo"), {"codigo": values["etapa"]})
            values["etapa_id"] = result.scalar_one_or_none()
    elif entity == "monitoreo_registros":
        values["humedad_pct"] = values.get("humedad_pct", values.get("humedad_porcentaje"))
        if not values.get("fuente_id"):
            result = await session.execute(text("select id from fuentes_monitoreo where codigo='manual'"))
            values["fuente_id"] = result.scalar_one_or_none()
        values.setdefault("registrado_en", values.get("created_at_local"))
    elif entity == "incidencias" and not values.get("tipo_id"):
        tipo = values.get("tipo") or "Otro"
        result = await session.execute(text("select id from tipos_incidencia where lower(nombre)=lower(:tipo) limit 1"), {"tipo": tipo})
        values["tipo_id"] = result.scalar_one_or_none()
    elif entity == "cuidados" and not values.get("tipo_id"):
        tipo = values.get("tipo") or "General"
        result = await session.execute(
            text("select id from tipos_alerta where lower(nombre)=lower(:tipo) or lower(codigo)=lower(:tipo) limit 1"),
            {"tipo": tipo},
        )
        values["tipo_id"] = result.scalar_one_or_none()
    elif entity == "practicas_agricolas":
        values["fecha_aplicacion"] = values.get("fecha_aplicacion", values.get("fecha"))
        if not values.get("tipo_id"):
            result = await session.execute(
                text("select id from tipos_practica where lower(nombre)=lower(:tipo) limit 1"),
                {"tipo": values.get("tipo") or "Otro"},
            )
            values["tipo_id"] = result.scalar_one_or_none()
    elif entity == "costos_produccion" and not values.get("categoria_id"):
        result = await session.execute(
            text("select id from categorias_costo where lower(nombre)=lower(:categoria) or lower(codigo)=lower(:categoria) limit 1"),
            {"categoria": values.get("categoria") or "otro"},
        )
        values["categoria_id"] = result.scalar_one_or_none()
    elif entity == "cosechas" and values.get("estado") == "publicado":
        values.setdefault("published_at", datetime.now(UTC))
    return values


async def _write_record(
    session: AsyncSession, current_user: CurrentUser, operation: SyncOperation,
) -> tuple[int, dict[str, Any] | None]:
    entity = operation.entity
    payload = await _prepare_payload(session, entity, operation.payload, operation.record_id)
    creating = operation.action == "create"
    await _validate_access(session, current_user, entity, operation.record_id, payload, creating)
    current_version = await _current_version(session, entity, operation.record_id)

    if creating and current_version is not None:
        raise HTTPException(status_code=409, detail="El UUID ya existe")
    if operation.action != "create" and current_version is None:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if operation.action != "create" and operation.base_version != current_version:
        raise ConflictError(current_version, await _record(session, entity, operation.record_id))

    if operation.action == "delete":
        result = await session.execute(
            text(f"update {entity} set deleted_at=now() where id=:id returning sync_version"),
            {"id": operation.record_id},
        )
        return int(result.scalar_one()), None

    allowed = ENTITY_FIELDS[entity]
    values = {key: value for key, value in payload.items() if key in allowed and value is not None}
    if entity in USER_COLUMN:
        values[USER_COLUMN[entity]] = current_user.id

    if creating:
        columns = ["id", *values.keys()]
        params = {"id": operation.record_id, **values}
        placeholders = [f":{column}" for column in columns]
        result = await session.execute(
            text(f"insert into {entity} ({','.join(columns)}) values ({','.join(placeholders)}) returning sync_version"),
            params,
        )
    else:
        if values:
            clauses = [f"{key}=:{key}" for key in values]
            result = await session.execute(
                text(f"update {entity} set {','.join(clauses)} where id=:id returning sync_version"),
                {"id": operation.record_id, **values},
            )
        else:
            result = await session.execute(text(f"select sync_version from {entity} where id=:id"), {"id": operation.record_id})
    version = int(result.scalar_one())

    if entity in {"biohuertos", "cultivos"} and "imagen" in payload:
        await set_principal_image(
            session,
            column="biohuerto_id" if entity == "biohuertos" else "cultivo_id",
            entity_id=operation.record_id,
            data_url=payload.get("imagen"),
        )
        await session.execute(text(f"update {entity} set updated_at=now() where id=:id"), {"id": operation.record_id})
        version = int(await _current_version(session, entity, operation.record_id) or version)
    settings = get_settings()
    if entity == "biohuertos" and "ubicacion_referencia" in payload:
        await session.execute(
            text("""
              update biohuertos set ubicacion_referencia_encrypted=
                case when :value is null or :value='' then null else pgp_sym_encrypt(:value,:key) end
              where id=:id
            """),
            {"value": payload.get("ubicacion_referencia"), "key": settings.pgcrypto_key, "id": operation.record_id},
        )
        version = int(await _current_version(session, entity, operation.record_id) or version)
    if entity == "cosechas" and "telefono" in payload:
        await session.execute(
            text("""
              update cosechas set telefono_encrypted=
                case when :value is null or :value='' then null else pgp_sym_encrypt(:value,:key) end
              where id=:id
            """),
            {"value": payload.get("telefono"), "key": settings.pgcrypto_key, "id": operation.record_id},
        )
        version = int(await _current_version(session, entity, operation.record_id) or version)
    if entity == "cultivos" and payload.get("celdas") is not None:
        await session.execute(text("update cultivo_celdas set deleted_at=now() where cultivo_id=:id and deleted_at is null"), {"id": operation.record_id})
        for cell in payload["celdas"]:
            await session.execute(
                text("insert into cultivo_celdas(cultivo_id,biohuerto_id,fila,columna) values(:id,:biohuerto_id,:fila,:columna)"),
                {"id": operation.record_id, "biohuerto_id": payload["biohuerto_id"], "fila": cell["fila"], "columna": cell["columna"]},
            )
        version = int(await _current_version(session, entity, operation.record_id) or version)
    return version, await _record(session, entity, operation.record_id)


class ConflictError(Exception):
    def __init__(self, server_version: int, server_record: dict[str, Any] | None):
        self.server_version = server_version
        self.server_record = server_record


async def apply_operation(
    session: AsyncSession, current_user: CurrentUser, operation: SyncOperation,
) -> SyncResult:
    existing = await session.execute(
        text("select status,resulting_version from sync_operations where operation_uuid=:id and usuario_id=:uid"),
        {"id": operation.operation_id, "uid": current_user.id},
    )
    prior = existing.mappings().first()
    if prior:
        record = await _record(session, operation.entity, operation.record_id)
        return SyncResult(operation_id=operation.operation_id, entity=operation.entity,
                          record_id=operation.record_id, status="duplicate",
                          server_version=prior["resulting_version"], record=record)

    result_status = "applied"
    resulting_version = None
    error_code = None
    try:
        resulting_version, record = await _write_record(session, current_user, operation)
        result = SyncResult(operation_id=operation.operation_id, entity=operation.entity,
                            record_id=operation.record_id, status="applied",
                            server_version=resulting_version, record=record)
    except ConflictError as exc:
        result_status = "conflict"
        resulting_version = exc.server_version
        error_code = "version_conflict"
        result = SyncResult(operation_id=operation.operation_id, entity=operation.entity,
                            record_id=operation.record_id, status="conflict",
                            server_version=exc.server_version, server_record=exc.server_record)
    except HTTPException as exc:
        result_status = "rejected"
        error_code = f"http_{exc.status_code}"
        result = SyncResult(operation_id=operation.operation_id, entity=operation.entity,
                            record_id=operation.record_id, status="rejected", error=str(exc.detail))

    await session.execute(
        text("""
            insert into sync_operations(
              operation_uuid,device_uuid,usuario_id,entity_type,record_uuid,action,
              base_version,resulting_version,status,error_code,client_updated_at
            ) values(:operation_uuid,:device_uuid,:usuario_id,:entity_type,:record_uuid,:action,
                     :base_version,:resulting_version,:status,:error_code,:client_updated_at)
        """),
        {"operation_uuid": operation.operation_id, "device_uuid": operation.device_id,
         "usuario_id": current_user.id, "entity_type": operation.entity,
         "record_uuid": operation.record_id, "action": operation.action,
         "base_version": operation.base_version, "resulting_version": resulting_version,
         "status": result_status, "error_code": error_code,
         "client_updated_at": operation.client_updated_at},
    )
    return result


async def pull_changes(
    session: AsyncSession, current_user: CurrentUser, cursor: int, limit: int = 200,
) -> tuple[list[SyncChange], int, bool]:
    result = await session.execute(
        text("""
          select cursor,entity_type,record_uuid,server_version,is_deleted
          from sync_change_log where cursor>:cursor order by cursor limit :limit
        """),
        {"cursor": cursor, "limit": limit + 1},
    )
    rows = result.mappings().all()
    has_more = len(rows) > limit
    selected = rows[:limit]
    changes: list[SyncChange] = []
    for row in selected:
        entity = row["entity_type"]
        if entity not in SYNC_ENTITIES:
            continue
        record = await _record(session, entity, row["record_uuid"])
        if record is not None:
            try:
                await _validate_access(session, current_user, entity, row["record_uuid"], record)
            except HTTPException:
                continue
        elif not row["is_deleted"]:
            continue
        changes.append(SyncChange(entity=entity, record_id=row["record_uuid"],
                                  server_version=row["server_version"], deleted=row["is_deleted"],
                                  record=None if row["is_deleted"] else record))
    next_cursor = int(selected[-1]["cursor"]) if selected else cursor
    return changes, next_cursor, has_more


async def bootstrap_data(session: AsyncSession, current_user: CurrentUser) -> tuple[dict, dict, int]:
    entities: dict[str, list[dict[str, Any]]] = {entity: [] for entity in SYNC_ENTITIES}
    if current_user.rol in {"productor", "admin"}:
        for entity in SYNC_ENTITIES:
            result = await session.execute(text(f"select id from {entity} where deleted_at is null order by updated_at desc limit 1000"))
            for record_id in result.scalars().all():
                try:
                    await _validate_access(session, current_user, entity, record_id, {})
                except HTTPException:
                    continue
                record = await _record(session, entity, record_id)
                if record:
                    entities[entity].append(record)
    catalogs: dict[str, list[dict[str, Any]]] = {}
    for key, table_name in {
        "especies": "especies", "unidades": "unidades", "etapas": "etapas_fenologicas",
        "tipos_incidencia": "tipos_incidencia", "zonas_planta": "zonas_planta",
        "tipos_alerta": "tipos_alerta", "tipos_practica": "tipos_practica",
        "categorias_costo": "categorias_costo",
    }.items():
        result = await session.execute(text(f"select to_jsonb(t) as record from {table_name} t where deleted_at is null" if table_name in {"especies", "unidades", "zonas_planta"} else f"select to_jsonb(t) as record from {table_name} t"))
        catalogs[key] = [row[0] for row in result.all()]
    cursor_result = await session.execute(text("select coalesce(max(cursor),0) from sync_change_log"))
    return entities, catalogs, int(cursor_result.scalar_one())
