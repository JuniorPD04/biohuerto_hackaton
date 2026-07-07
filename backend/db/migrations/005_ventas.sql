-- 005_ventas.sql
-- Fecha: 2026-07-06
-- Punto de venta directo para productores: "rondas de venta" (una sesion de
-- venta, ej. una feria/minimarket) y las lineas de "ventas" individuales
-- dentro de cada ronda. Al confirmar una venta se descuenta el stock
-- (cantidad) de la cosecha correspondiente.
-- Idempotente: se puede ejecutar varias veces sin error.

CREATE TABLE IF NOT EXISTS venta_rondas (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id     BIGINT        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  nombre         VARCHAR(160)  NOT NULL,
  fecha          DATE          NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio    TIME          NOT NULL DEFAULT LOCALTIME,
  estado         VARCHAR(16)   NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ   NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_venta_rondas_usuario_nombre
  ON venta_rondas(usuario_id, nombre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venta_rondas_usuario ON venta_rondas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_venta_rondas_fecha   ON venta_rondas(fecha);

CREATE TABLE IF NOT EXISTS ventas (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  ronda_id         UUID          NOT NULL REFERENCES venta_rondas(id) ON DELETE CASCADE,
  cosecha_id       UUID          NULL REFERENCES cosechas(id) ON DELETE SET NULL,
  usuario_id       BIGINT        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  nombre_producto  VARCHAR(140)  NOT NULL,
  cultivo          VARCHAR(140)  NULL,
  precio_unitario  NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
  cantidad         NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  unidad_id        SMALLINT      NULL REFERENCES unidades(id),
  total            NUMERIC(12,2) GENERATED ALWAYS AS (round(cantidad * precio_unitario, 2)) STORED,
  fecha            DATE          NOT NULL,
  hora             TIME          NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ   NULL
);

CREATE INDEX IF NOT EXISTS idx_ventas_ronda    ON ventas(ronda_id);
CREATE INDEX IF NOT EXISTS idx_ventas_usuario  ON ventas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ventas_cosecha  ON ventas(cosecha_id);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha    ON ventas(fecha);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_venta_rondas_upd') THEN
    CREATE TRIGGER trg_venta_rondas_upd BEFORE UPDATE ON venta_rondas
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ============================================================
--  Control de acceso: nueva vista "ventas.gestion"
-- ============================================================
INSERT INTO vistas (codigo, nombre, modulo, descripcion)
VALUES ('ventas.gestion', 'Venta ahora', 'ventas', 'Punto de venta directo y su historial')
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    modulo = EXCLUDED.modulo,
    descripcion = EXCLUDED.descripcion,
    is_active = TRUE;

INSERT INTO vista_acciones (vista_id, accion_id)
SELECT v.id, a.id
FROM vistas v, acciones a
WHERE v.codigo = 'ventas.gestion'
  AND a.codigo IN ('ver_lista','ver_detalle','crear','editar','buscar','exportar')
ON CONFLICT DO NOTHING;

-- productor: gestiona su propio punto de venta
INSERT INTO rol_permisos (rol_id, vista_id, accion_id)
SELECT r.id, v.id, a.id
FROM roles r, vistas v, acciones a
WHERE r.codigo = 'productor'
  AND v.codigo = 'ventas.gestion'
  AND a.codigo IN ('ver_lista','ver_detalle','crear','editar','buscar','exportar')
  AND EXISTS (
    SELECT 1 FROM vista_acciones va
    WHERE va.vista_id = v.id AND va.accion_id = a.id
  )
ON CONFLICT DO NOTHING;

-- admin: supervision y reportes globales (explicito; a diferencia del seed
-- inicial, una migracion sobre BD ya existente no hereda esto automatico)
INSERT INTO rol_permisos (rol_id, vista_id, accion_id)
SELECT r.id, v.id, va.accion_id
FROM roles r, vistas v
JOIN vista_acciones va ON va.vista_id = v.id
WHERE r.codigo = 'admin'
  AND v.codigo = 'ventas.gestion'
ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON venta_rondas, ventas TO app_bio_user;
