-- Soporte para seleccionar multiples celdas por cultivo.
-- Ejecutar despues de 20260616_productores_cliente_layout.sql si esa migracion ya fue aplicada.

CREATE TABLE IF NOT EXISTS cultivo_celdas (
  id           BIGSERIAL     PRIMARY KEY,
  cultivo_id   UUID          NOT NULL REFERENCES cultivos(id) ON DELETE CASCADE,
  biohuerto_id UUID          NOT NULL REFERENCES biohuertos(id) ON DELETE CASCADE,
  fila         SMALLINT      NOT NULL CHECK (fila BETWEEN 1 AND 30),
  columna      SMALLINT      NOT NULL CHECK (columna BETWEEN 1 AND 30),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ   NULL,
  UNIQUE (cultivo_id, fila, columna)
);

INSERT INTO cultivo_celdas (cultivo_id, biohuerto_id, fila, columna)
SELECT c.id, c.biohuerto_id, c.celda_fila, c.celda_columna
FROM cultivos c
WHERE c.celda_fila IS NOT NULL
  AND c.celda_columna IS NOT NULL
  AND c.is_active = TRUE
  AND c.deleted_at IS NULL
ON CONFLICT (cultivo_id, fila, columna) DO UPDATE
SET biohuerto_id = EXCLUDED.biohuerto_id,
    deleted_at = NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cultivo_celdas_biohuerto_celda_activa
  ON cultivo_celdas(biohuerto_id, fila, columna)
  WHERE deleted_at IS NULL;
