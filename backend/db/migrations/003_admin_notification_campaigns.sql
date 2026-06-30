-- Campanias manuales de notificacion creadas por superadministradores.
-- La imagen se guarda una sola vez; los mensajes push reciben una URL opaca.

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  audience_type  VARCHAR(16) NOT NULL CHECK (audience_type IN ('specific','selected','all')),
  title          VARCHAR(120) NOT NULL,
  body           VARCHAR(500) NOT NULL,
  target_url     VARCHAR(500) NOT NULL DEFAULT '/',
  image_data     BYTEA NULL,
  image_mime     VARCHAR(40) NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((image_data IS NULL AND image_mime IS NULL) OR (image_data IS NOT NULL AND image_mime IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS notification_campaign_recipients (
  campaign_id UUID NOT NULL REFERENCES notification_campaigns(id) ON DELETE CASCADE,
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_created
  ON notification_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_campaign_recipients_user
  ON notification_campaign_recipients(usuario_id, campaign_id);

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS campaign_id UUID NULL REFERENCES notification_campaigns(id) ON DELETE SET NULL;
ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS image_url TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_outbox_campaign
  ON notification_outbox(campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON notification_campaigns,
  notification_campaign_recipients TO app_bio_user;

