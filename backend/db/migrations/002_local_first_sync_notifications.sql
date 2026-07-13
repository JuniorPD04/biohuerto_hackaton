-- Sincronizacion local-first v2 y notificaciones web push.
-- Idempotente y ejecutable con migration_user.

CREATE SEQUENCE IF NOT EXISTS sync_version_seq;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'biohuertos','cultivos','monitoreo_registros','incidencias','cuidados',
    'practicas_agricolas','costos_produccion','cosechas'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS sync_version BIGINT NOT NULL DEFAULT nextval(''sync_version_seq'')',
      table_name
    );
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS sync_change_log (
  cursor         BIGSERIAL PRIMARY KEY,
  entity_type    VARCHAR(80) NOT NULL,
  record_uuid    UUID NOT NULL,
  server_version BIGINT NOT NULL,
  is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_changes_cursor ON sync_change_log(cursor);
CREATE INDEX IF NOT EXISTS idx_sync_changes_record ON sync_change_log(entity_type, record_uuid);

CREATE TABLE IF NOT EXISTS sync_operations (
  id                BIGSERIAL PRIMARY KEY,
  operation_uuid    UUID NOT NULL UNIQUE,
  device_uuid       UUID NOT NULL,
  usuario_id        BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  entity_type       VARCHAR(80) NOT NULL,
  record_uuid       UUID NOT NULL,
  action            VARCHAR(12) NOT NULL CHECK (action IN ('create','update','delete')),
  base_version      BIGINT NULL,
  resulting_version BIGINT NULL,
  status            VARCHAR(20) NOT NULL CHECK (status IN ('applied','conflict','rejected')),
  error_code        VARCHAR(80) NULL,
  client_updated_at TIMESTAMPTZ NOT NULL,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_operations_user ON sync_operations(usuario_id, processed_at DESC);

CREATE OR REPLACE FUNCTION track_sync_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.sync_version := nextval('sync_version_seq');
    NEW.updated_at := now();
  END IF;
  INSERT INTO sync_change_log(entity_type, record_uuid, server_version, is_deleted)
  VALUES (TG_TABLE_NAME, NEW.id, NEW.sync_version, NEW.deleted_at IS NOT NULL);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'biohuertos','cultivos','monitoreo_registros','incidencias','cuidados',
    'practicas_agricolas','costos_produccion','cosechas'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_sync_change ON %I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_sync_change BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION track_sync_change()',
      table_name, table_name
    );
  END LOOP;
END $$;

-- Cambiar celdas invalida la version del cultivo para que viaje como una sola entidad.
CREATE OR REPLACE FUNCTION touch_cultivo_from_cell() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE cultivos SET updated_at = now() WHERE id = OLD.cultivo_id;
    RETURN OLD;
  END IF;
  UPDATE cultivos SET updated_at = now() WHERE id = NEW.cultivo_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_cultivo_celdas_sync_touch ON cultivo_celdas;
CREATE TRIGGER trg_cultivo_celdas_sync_touch
AFTER INSERT OR UPDATE OR DELETE ON cultivo_celdas
FOR EACH ROW EXECUTE FUNCTION touch_cultivo_from_cell();

-- Semilla del cursor para registros existentes. NOT EXISTS evita duplicarla al reejecutar.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'biohuertos','cultivos','monitoreo_registros','incidencias','cuidados',
    'practicas_agricolas','costos_produccion','cosechas'
  ] LOOP
    EXECUTE format(
      'INSERT INTO sync_change_log(entity_type,record_uuid,server_version,is_deleted)
       SELECT %L,id,sync_version,deleted_at IS NOT NULL FROM %I t
       WHERE NOT EXISTS (SELECT 1 FROM sync_change_log l WHERE l.entity_type=%L AND l.record_uuid=t.id)',
      table_name, table_name, table_name
    );
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS notification_preferences (
  usuario_id       BIGINT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  alertas_altas    BOOLEAN NOT NULL DEFAULT TRUE,
  cuidados         BOOLEAN NOT NULL DEFAULT TRUE,
  conflictos       BOOLEAN NOT NULL DEFAULT TRUE,
  sincronizacion   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id         BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  device_uuid        UUID NOT NULL,
  endpoint_hash      CHAR(64) NOT NULL UNIQUE,
  endpoint_encrypted BYTEA NOT NULL,
  p256dh_encrypted   BYTEA NOT NULL,
  auth_encrypted     BYTEA NOT NULL,
  user_agent         TEXT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  failure_count      INTEGER NOT NULL DEFAULT 0,
  last_success_at    TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(usuario_id, device_uuid)
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  dedupe_key     VARCHAR(180) NOT NULL UNIQUE,
  title          VARCHAR(180) NOT NULL,
  body           TEXT NOT NULL,
  target_url     TEXT NOT NULL DEFAULT '/alertas',
  tag            VARCHAR(100) NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','error')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  available_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ NULL,
  last_error     TEXT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_pending ON notification_outbox(status, available_at);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              BIGSERIAL PRIMARY KEY,
  outbox_id       BIGINT NOT NULL REFERENCES notification_outbox(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','error')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ NULL,
  last_error      TEXT NULL,
  UNIQUE(outbox_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_pending
  ON notification_deliveries(status, available_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON sync_change_log, sync_operations,
  notification_preferences, push_subscriptions, notification_outbox, notification_deliveries TO app_bio_user;
GRANT USAGE, SELECT ON SEQUENCE sync_version_seq, sync_change_log_cursor_seq,
  sync_operations_id_seq, notification_outbox_id_seq, notification_deliveries_id_seq TO app_bio_user;
