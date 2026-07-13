-- Productores, cliente y mapa de biohuerto.
-- Ejecutar con migration_user o un rol con permisos de ALTER/CREATE INDEX.

ALTER TABLE biohuertos
  ADD COLUMN IF NOT EXISTS grid_filas SMALLINT NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS grid_columnas SMALLINT NOT NULL DEFAULT 4;

ALTER TABLE biohuertos
  DROP CONSTRAINT IF EXISTS chk_biohuertos_grid_filas,
  DROP CONSTRAINT IF EXISTS chk_biohuertos_grid_columnas,
  ADD CONSTRAINT chk_biohuertos_grid_filas CHECK (grid_filas BETWEEN 1 AND 30),
  ADD CONSTRAINT chk_biohuertos_grid_columnas CHECK (grid_columnas BETWEEN 1 AND 30);

UPDATE biohuertos
SET grid_filas = COALESCE(grid_filas, 4),
    grid_columnas = COALESCE(grid_columnas, 4);

ALTER TABLE cultivos
  ADD COLUMN IF NOT EXISTS celda_fila SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS celda_columna SMALLINT NULL;

ALTER TABLE cultivos
  DROP CONSTRAINT IF EXISTS chk_cultivos_celda_fila,
  DROP CONSTRAINT IF EXISTS chk_cultivos_celda_columna,
  ADD CONSTRAINT chk_cultivos_celda_fila CHECK (celda_fila IS NULL OR celda_fila BETWEEN 1 AND 30),
  ADD CONSTRAINT chk_cultivos_celda_columna CHECK (celda_columna IS NULL OR celda_columna BETWEEN 1 AND 30);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cultivos_biohuerto_celda_activa
  ON cultivos(biohuerto_id, celda_fila, celda_columna)
  WHERE celda_fila IS NOT NULL
    AND celda_columna IS NOT NULL
    AND is_active = TRUE
    AND deleted_at IS NULL;

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

INSERT INTO vistas (codigo, nombre, modulo, descripcion)
VALUES ('mercado.productos', 'Productos disponibles', 'mercado', 'Vista cliente de productos publicados')
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    modulo = EXCLUDED.modulo,
    descripcion = EXCLUDED.descripcion,
    is_active = TRUE;

INSERT INTO vista_acciones (vista_id, accion_id)
SELECT v.id, a.id
FROM vistas v, acciones a
WHERE v.codigo = 'mercado.productos'
  AND a.codigo IN ('ver_lista', 'ver_detalle', 'buscar')
ON CONFLICT DO NOTHING;

INSERT INTO rol_permisos (rol_id, vista_id, accion_id)
SELECT r.id, v.id, a.id
FROM roles r, vistas v, acciones a
WHERE r.codigo = 'consumidor'
  AND v.codigo = 'mercado.productos'
  AND a.codigo IN ('ver_lista', 'ver_detalle', 'buscar')
  AND EXISTS (
    SELECT 1
    FROM vista_acciones va
    WHERE va.vista_id = v.id
      AND va.accion_id = a.id
  )
ON CONFLICT DO NOTHING;

INSERT INTO rol_permisos (rol_id, vista_id, accion_id)
SELECT r.id, v.id, va.accion_id
FROM roles r, vistas v
JOIN vista_acciones va ON va.vista_id = v.id
WHERE r.codigo = 'admin'
  AND v.codigo = 'mercado.productos'
ON CONFLICT DO NOTHING;

DELETE FROM rol_permisos rp
USING roles r, vistas v
WHERE rp.rol_id = r.id
  AND rp.vista_id = v.id
  AND r.codigo = 'consumidor'
  AND v.codigo = 'cosechas.gestion';
