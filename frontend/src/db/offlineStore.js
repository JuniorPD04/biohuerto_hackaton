import { dbExecute, dbQuery, openLocalDb } from "./localDb.js";
import { decryptJson, encryptJson, getDeviceId } from "./crypto.js";

let activeUserId = null;

export async function configureOfflineUser(userId) {
  activeUserId = userId == null ? null : String(userId);
  if (!activeUserId) return null;
  return openLocalDb(activeUserId);
}

export function offlineUserId() {
  return activeUserId;
}

function requireUser() {
  if (!activeUserId) throw new Error("No hay usuario local activo");
  return activeUserId;
}

function parentFor(row) {
  return row?.cultivo_id || row?.biohuerto_id || null;
}

export async function cacheRows(entityType, rows, status = "synced") {
  const userId = requireUser();
  for (const row of rows || []) {
    if (!row?.id) continue;
    const payload = await encryptJson(userId, row);
    await dbExecute(
      `INSERT INTO entities(entity_type, record_id, parent_id, payload, server_version, sync_status, deleted, local_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(entity_type, record_id) DO UPDATE SET
         parent_id=CASE WHEN entities.sync_status IN ('pending','conflict') THEN entities.parent_id ELSE excluded.parent_id END,
         payload=CASE WHEN entities.sync_status IN ('pending','conflict') THEN entities.payload ELSE excluded.payload END,
         server_version=CASE WHEN entities.sync_status IN ('pending','conflict') THEN entities.server_version ELSE COALESCE(excluded.server_version, entities.server_version) END,
         sync_status=CASE WHEN entities.sync_status IN ('pending','conflict') THEN entities.sync_status ELSE excluded.sync_status END,
         deleted=CASE WHEN entities.sync_status IN ('pending','conflict') THEN entities.deleted ELSE 0 END,
         local_updated_at=CASE WHEN entities.sync_status IN ('pending','conflict') THEN entities.local_updated_at ELSE excluded.local_updated_at END`,
      [entityType, String(row.id), parentFor(row), payload, row.sync_version ?? null, status, new Date().toISOString()]
    );
  }
}

export async function readRows(entityType, params = {}) {
  const userId = requireUser();
  const rows = await dbQuery(
    "SELECT * FROM entities WHERE entity_type = ? AND deleted = 0 ORDER BY local_updated_at DESC",
    [entityType]
  );
  const decoded = await Promise.all(rows.map(async (row) => ({
    ...(await decryptJson(userId, row.payload)),
    _syncStatus: row.sync_status,
    sync_version: row.server_version,
  })));
  return decoded.filter((row) => Object.entries(params || {}).every(([key, value]) => {
    if (value == null || value === "") return true;
    return String(row[key] ?? "") === String(value);
  }));
}

export async function readRow(entityType, recordId) {
  const rows = await readRows(entityType);
  return rows.find((row) => String(row.id) === String(recordId)) || null;
}

export async function markLocalDeleted(entityType, recordId) {
  await dbExecute(
    "UPDATE entities SET deleted=1,sync_status='synced',local_updated_at=? WHERE entity_type=? AND record_id=?",
    [new Date().toISOString(), entityType, String(recordId)]
  );
}

export async function queueOperation(entityType, action, body = {}, recordId = null) {
  const userId = requireUser();
  const id = String(recordId || body.id || crypto.randomUUID());
  const operationId = crypto.randomUUID();
  const existing = await readRow(entityType, id);
  const optimistic = action === "delete"
    ? existing || { id }
    : { ...(existing || {}), ...body, id, _syncStatus: "pending" };
  const payload = await encryptJson(userId, body);
  const optimisticPayload = await encryptJson(userId, optimistic);
  const now = new Date().toISOString();

  await dbExecute("BEGIN");
  try {
    await dbExecute(
      `INSERT INTO outbox(operation_id, device_id, entity_type, action, record_id, base_version, payload, client_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [operationId, getDeviceId(), entityType, action, id, existing?.sync_version ?? null, payload, now]
    );
    await dbExecute(
      `INSERT INTO entities(entity_type, record_id, parent_id, payload, server_version, sync_status, deleted, local_updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(entity_type, record_id) DO UPDATE SET
         parent_id=excluded.parent_id, payload=excluded.payload, sync_status='pending',
         deleted=excluded.deleted, local_updated_at=excluded.local_updated_at`,
      [entityType, id, parentFor(optimistic), optimisticPayload, existing?.sync_version ?? null, action === "delete" ? 1 : 0, now]
    );
    await dbExecute("COMMIT");
  } catch (error) {
    await dbExecute("ROLLBACK");
    throw error;
  }
  window.dispatchEvent(new CustomEvent("biohuerto:outbox-changed"));
  return optimistic;
}

export async function getOutbox() {
  const userId = requireUser();
  const rows = await dbQuery("SELECT * FROM outbox ORDER BY client_updated_at LIMIT 50");
  return Promise.all(rows.map(async (row) => ({
    operation_id: row.operation_id,
    device_id: row.device_id,
    entity: row.entity_type,
    action: row.action,
    record_id: row.record_id,
    base_version: row.base_version,
    payload: await decryptJson(userId, row.payload),
    client_updated_at: row.client_updated_at,
  })));
}

export async function outboxCount() {
  const [row] = await dbQuery("SELECT count(*) AS total FROM outbox");
  return Number(row?.total || 0);
}

export async function conflictCount() {
  const [row] = await dbQuery("SELECT count(*) AS total FROM conflicts");
  return Number(row?.total || 0);
}

export async function listConflicts() {
  const userId = requireUser();
  const rows = await dbQuery("SELECT * FROM conflicts ORDER BY created_at DESC");
  return Promise.all(rows.map(async (row) => ({
    ...row,
    local: await decryptJson(userId, row.local_payload),
    server: row.server_payload ? await decryptJson(userId, row.server_payload) : null,
  })));
}

export async function resolveConflict(operationId, choice) {
  const [conflict] = await dbQuery("SELECT * FROM conflicts WHERE operation_id=?", [operationId]);
  if (!conflict) return;
  if (choice === "server") {
    if (conflict.server_payload) {
      await dbExecute(
        "UPDATE entities SET payload=?,server_version=?,sync_status='synced',deleted=0,local_updated_at=? WHERE entity_type=? AND record_id=?",
        [conflict.server_payload, conflict.server_version, new Date().toISOString(), conflict.entity_type, conflict.record_id]
      );
    }
    await dbExecute("DELETE FROM outbox WHERE operation_id=?", [operationId]);
  } else {
    const [operation] = await dbQuery("SELECT * FROM outbox WHERE operation_id=?", [operationId]);
    if (operation) {
      await dbExecute("DELETE FROM outbox WHERE operation_id=?", [operationId]);
      await dbExecute(
        `INSERT INTO outbox(operation_id,device_id,entity_type,action,record_id,base_version,payload,client_updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        [crypto.randomUUID(), operation.device_id, operation.entity_type, "update", operation.record_id,
          conflict.server_version, operation.payload, new Date().toISOString()]
      );
      await dbExecute("UPDATE entities SET server_version=?,sync_status='pending' WHERE entity_type=? AND record_id=?",
        [conflict.server_version, conflict.entity_type, conflict.record_id]);
    }
  }
  await dbExecute("DELETE FROM conflicts WHERE operation_id=?", [operationId]);
  window.dispatchEvent(new CustomEvent("biohuerto:outbox-changed"));
}

export async function applySyncResponse(response) {
  const userId = requireUser();
  for (const result of response?.results || []) {
    if (["applied", "duplicate"].includes(result.status)) {
      await dbExecute("DELETE FROM outbox WHERE operation_id = ?", [result.operation_id]);
      await dbExecute(
        "UPDATE entities SET sync_status='synced',deleted=0 WHERE entity_type=? AND record_id=?",
        [result.entity, result.record_id]
      );
      if (result.record) await cacheRows(result.entity, [{ ...result.record, sync_version: result.server_version }]);
    } else if (result.status === "conflict") {
      const [operation] = await dbQuery("SELECT * FROM outbox WHERE operation_id = ?", [result.operation_id]);
      if (operation) {
        await dbExecute(
          `INSERT OR REPLACE INTO conflicts(operation_id, entity_type, record_id, local_payload, server_payload, server_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [result.operation_id, result.entity, result.record_id, operation.payload,
            await encryptJson(userId, result.server_record || null), result.server_version, new Date().toISOString()]
        );
        await dbExecute(
          "UPDATE entities SET sync_status = 'conflict' WHERE entity_type = ? AND record_id = ?",
          [result.entity, result.record_id]
        );
      }
    } else if (result.status === "rejected") {
      await dbExecute(
        "UPDATE outbox SET attempts=attempts+1, last_error=? WHERE operation_id=?",
        [result.error || "Operacion rechazada", result.operation_id]
      );
      await dbExecute(
        "UPDATE entities SET sync_status='error' WHERE entity_type=? AND record_id=?",
        [result.entity, result.record_id]
      );
    }
  }
  for (const change of response?.changes || []) {
    if (change.deleted) {
      await dbExecute("UPDATE entities SET deleted=1, server_version=? WHERE entity_type=? AND record_id=?",
        [change.server_version, change.entity, change.record_id]);
    } else if (change.record) {
      await cacheRows(change.entity, [{ ...change.record, sync_version: change.server_version }]);
    }
  }
  if (response?.next_cursor != null) {
    await dbExecute(
      `INSERT INTO local_meta(key,value,updated_at) VALUES ('sync_cursor',?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      [String(response.next_cursor), new Date().toISOString()]
    );
  }
  window.dispatchEvent(new CustomEvent("biohuerto:outbox-changed"));
}

export async function getSyncCursor() {
  const [row] = await dbQuery("SELECT value FROM local_meta WHERE key='sync_cursor'");
  return Number(row?.value || 0);
}

export async function cacheBootstrap(data) {
  for (const [entity, rows] of Object.entries(data?.entities || {})) await cacheRows(entity, rows);
  for (const [key, value] of Object.entries(data?.catalogs || {})) {
    await dbExecute(
      `INSERT INTO catalogs(catalog_key,payload,updated_at) VALUES (?,?,?)
       ON CONFLICT(catalog_key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`,
      [key, await encryptJson(requireUser(), value), new Date().toISOString()]
    );
  }
  if (data?.cursor != null) {
    await dbExecute(
      `INSERT INTO local_meta(key,value,updated_at) VALUES ('sync_cursor',?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
      [String(data.cursor), new Date().toISOString()]
    );
  }
}

export async function saveOfflineSession(user, permissions) {
  if (!user?.id) return;
  await configureOfflineUser(user.id);
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const value = await encryptJson(String(user.id), { user, permissions, expiresAt });
  await dbExecute(
    `INSERT INTO local_meta(key,value,updated_at) VALUES ('offline_session',?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    [value, new Date().toISOString()]
  );
  localStorage.setItem("biohuerto:last-user", String(user.id));
}

export async function loadOfflineSession() {
  const userId = localStorage.getItem("biohuerto:last-user");
  if (!userId) return null;
  await configureOfflineUser(userId);
  const [row] = await dbQuery("SELECT value FROM local_meta WHERE key='offline_session'");
  if (!row?.value) return null;
  const session = await decryptJson(userId, row.value);
  if (!session?.expiresAt || session.expiresAt < Date.now()) return null;
  return session;
}

export function lockOfflineSession() {
  localStorage.removeItem("biohuerto:last-user");
}

export async function getLocalNotificationPreferences() {
  const [row] = await dbQuery("SELECT * FROM notification_preferences WHERE id=1");
  return {
    alertas_altas: Boolean(row?.alertas_altas ?? 1),
    cuidados: Boolean(row?.cuidados ?? 1),
    conflictos: Boolean(row?.conflictos ?? 1),
    sincronizacion: Boolean(row?.sincronizacion ?? 0),
  };
}

export async function saveLocalNotificationPreferences(preferences) {
  await dbExecute(
    `UPDATE notification_preferences SET alertas_altas=?,cuidados=?,conflictos=?,sincronizacion=?,
      permission=?,updated_at=? WHERE id=1`,
    [preferences.alertas_altas ? 1 : 0, preferences.cuidados ? 1 : 0,
      preferences.conflictos ? 1 : 0, preferences.sincronizacion ? 1 : 0,
      "Notification" in window ? Notification.permission : "unsupported", new Date().toISOString()]
  );
}
