-- 006_produccion.sql
-- Fecha: 2026-07-06
-- Registro de producción: autoconsumo (cantidad que el productor se queda,
-- separada de la venta) y "cantidad_inicial" en cosechas (total producido,
-- ya que `cantidad` es el stock vigente y baja con ventas/autoconsumo).
-- Idempotente: se puede ejecutar varias veces sin error.

ALTER TABLE cosechas
  ADD COLUMN IF NOT EXISTS cantidad_inicial NUMERIC(10,2);

-- Backfill: en cosechas ya existentes se asume que la cantidad actual es el
-- total producido (no hay forma de reconstruir ventas/autoconsumo previos).
UPDATE cosechas SET cantidad_inicial = cantidad WHERE cantidad_inicial IS NULL;

ALTER TABLE cosechas
  ALTER COLUMN cantidad_inicial SET DEFAULT 0,
  ALTER COLUMN cantidad_inicial SET NOT NULL;

ALTER TABLE cosechas
  DROP CONSTRAINT IF EXISTS chk_cosechas_cantidad_inicial,
  ADD CONSTRAINT chk_cosechas_cantidad_inicial CHECK (cantidad_inicial >= 0);

CREATE TABLE IF NOT EXISTS autoconsumos (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  cosecha_id      UUID          NOT NULL REFERENCES cosechas(id) ON DELETE CASCADE,
  usuario_id      BIGINT        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  nombre_producto VARCHAR(140)  NOT NULL,
  cultivo         VARCHAR(140)  NULL,
  cantidad        NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  unidad_id       SMALLINT      NULL REFERENCES unidades(id),
  fecha           DATE          NOT NULL,
  notas           VARCHAR(200)  NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ   NULL
);

CREATE INDEX IF NOT EXISTS idx_autoconsumos_cosecha ON autoconsumos(cosecha_id);
CREATE INDEX IF NOT EXISTS idx_autoconsumos_usuario ON autoconsumos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_autoconsumos_fecha   ON autoconsumos(fecha);

GRANT SELECT, INSERT, UPDATE, DELETE ON autoconsumos TO app_bio_user;
