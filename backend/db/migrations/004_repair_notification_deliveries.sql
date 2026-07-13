-- Reparacion para instalaciones donde la migracion 002 se aplico parcialmente.
-- Mantener separada de 002 permite actualizar bases ya compartidas sin resetear datos.

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              BIGSERIAL PRIMARY KEY,
  outbox_id       BIGINT NOT NULL,
  subscription_id UUID NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','error')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ NULL,
  last_error      TEXT NULL,
  UNIQUE(outbox_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_pending
  ON notification_deliveries(status, available_at);

-- Las bases antiguas pueden tener las tablas padre con otro propietario. La
-- entrega funciona igualmente; cuando hay permiso se restauran tambien las FK.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_deliveries_outbox_fk') THEN
    BEGIN
      ALTER TABLE notification_deliveries
        ADD CONSTRAINT notification_deliveries_outbox_fk
        FOREIGN KEY(outbox_id) REFERENCES notification_outbox(id) ON DELETE CASCADE;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'FK outbox omitida por propiedad heredada';
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_deliveries_subscription_fk') THEN
    BEGIN
      ALTER TABLE notification_deliveries
        ADD CONSTRAINT notification_deliveries_subscription_fk
        FOREIGN KEY(subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'FK subscription omitida por propiedad heredada';
    END;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON notification_deliveries TO app_bio_user;
GRANT USAGE, SELECT ON SEQUENCE notification_deliveries_id_seq TO app_bio_user;
