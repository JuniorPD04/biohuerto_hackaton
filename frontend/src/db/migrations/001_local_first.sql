CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
  entity_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  parent_id TEXT,
  payload TEXT NOT NULL,
  server_version INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  deleted INTEGER NOT NULL DEFAULT 0,
  local_updated_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, record_id)
);
CREATE INDEX IF NOT EXISTS idx_entities_type_parent ON entities(entity_type, parent_id);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(sync_status);

CREATE TABLE IF NOT EXISTS catalogs (
  catalog_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  operation_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT NOT NULL,
  base_version INTEGER,
  payload TEXT NOT NULL,
  client_updated_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(client_updated_at);

CREATE TABLE IF NOT EXISTS conflicts (
  operation_id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  local_payload TEXT NOT NULL,
  server_payload TEXT,
  server_version INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  alertas_altas INTEGER NOT NULL DEFAULT 1,
  cuidados INTEGER NOT NULL DEFAULT 1,
  conflictos INTEGER NOT NULL DEFAULT 1,
  sincronizacion INTEGER NOT NULL DEFAULT 0,
  permission TEXT NOT NULL DEFAULT 'default',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO notification_preferences
  (id, alertas_altas, cuidados, conflictos, sincronizacion, permission, updated_at)
VALUES (1, 1, 1, 1, 0, 'default', datetime('now'));
INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
