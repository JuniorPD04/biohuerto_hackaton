-- 008_registro_produccion_v2.sql
-- Fecha: 2026-07-13
-- Amplía el registro de producción según la ficha oficial CISUSAT:
--  · modalidades del biohuerto (comunitario / casero)
--  · métodos de práctica (el "cómo" de cada tipo de práctica) + seed inicial
--  · catálogo de actividades y bitácora de dedicaciones (horas por persona/biohuerto)
--  · unidad "hora" y categorías de costo Semilla / Abono / Mejorador (vitamina)
--  · vista RBAC "reportes.gestion" (módulo de reportes, solo-admin)
-- Idempotente: se puede ejecutar varias veces sin error.
-- Correr como migration_user (dueño del esquema) para heredar permisos.

-- ============================================================
-- 1) Modalidad del biohuerto (comunitario / casero)
--    Eje ORGANIZATIVO, distinto del tipo_area (físico). En comunitario el
--    espacio es compartido (parcelas); en casero es del hogar.
-- ============================================================
CREATE TABLE IF NOT EXISTS modalidades (
  id         SMALLSERIAL PRIMARY KEY,
  codigo     VARCHAR(20)  NOT NULL UNIQUE,
  nombre     VARCHAR(60)  NOT NULL,
  es_sistema BOOLEAN      NOT NULL DEFAULT FALSE
);

INSERT INTO modalidades (codigo, nombre, es_sistema) VALUES
  ('comunitario', 'Comunitario', TRUE),
  ('casero',      'Casero',      TRUE)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE biohuertos
  ADD COLUMN IF NOT EXISTS modalidad_id SMALLINT REFERENCES modalidades(id);

-- Los biohuertos existentes se asumen "casero" hasta que el productor indique lo contrario.
UPDATE biohuertos
   SET modalidad_id = (SELECT id FROM modalidades WHERE codigo = 'casero')
 WHERE modalidad_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_biohuertos_modalidad ON biohuertos(modalidad_id);

-- ============================================================
-- 2) Métodos de práctica (el "cómo" de cada tipo de práctica)
--    Catálogo extensible ("Agregar nuevo"), colgado de tipos_practica.
-- ============================================================
CREATE TABLE IF NOT EXISTS metodos_practica (
  id               SMALLSERIAL  PRIMARY KEY,
  tipo_practica_id SMALLINT     NOT NULL REFERENCES tipos_practica(id) ON DELETE CASCADE,
  nombre           VARCHAR(120) NOT NULL,
  es_sistema       BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE (tipo_practica_id, nombre)
);

ALTER TABLE practicas_agricolas
  ADD COLUMN IF NOT EXISTS metodo_id SMALLINT REFERENCES metodos_practica(id);

CREATE INDEX IF NOT EXISTS idx_practicas_metodo ON practicas_agricolas(metodo_id);

-- Seed inicial de métodos por tipo (idempotente: join por nombre de tipo + ON CONFLICT).
INSERT INTO metodos_practica (tipo_practica_id, nombre, es_sistema)
SELECT tp.id, m.nombre, TRUE
FROM tipos_practica tp
JOIN (VALUES
  ('Compost / Abono orgánico',      'Aplicación al voleo'),
  ('Compost / Abono orgánico',      'Incorporado al suelo'),
  ('Compost / Abono orgánico',      'En hoyo de siembra'),
  ('Compost / Abono orgánico',      'Té de compost (líquido)'),
  ('Abono verde',                   'Siembra de leguminosas'),
  ('Abono verde',                   'Incorporación en floración'),
  ('Abono verde',                   'Corte y cobertura (mulch)'),
  ('Sin agroquímicos',              'Manejo 100% orgánico'),
  ('Sin agroquímicos',              'Sustitución de químico por orgánico'),
  ('Control biológico',             'Liberación de insectos benéficos'),
  ('Control biológico',             'Aplicación de bioinsecticida'),
  ('Control biológico',             'Control manual de plagas'),
  ('Control biológico',             'Extractos vegetales (ajo, ají, etc.)'),
  ('Trampas para plagas',           'Trampa cromática (amarilla/azul)'),
  ('Trampas para plagas',           'Trampa de feromonas'),
  ('Trampas para plagas',           'Trampa casera con botella'),
  ('Riego eficiente',               'Riego por goteo'),
  ('Riego eficiente',               'Riego por micro-aspersión'),
  ('Riego eficiente',               'Riego manual regulado'),
  ('Riego eficiente',               'Mulch para retener humedad'),
  ('Poda sanitaria',                'Eliminación de hojas enfermas'),
  ('Poda sanitaria',                'Poda de formación'),
  ('Poda sanitaria',                'Deshoje / deschuponado'),
  ('Rotación de cultivos',          'Rotación por familia botánica'),
  ('Rotación de cultivos',          'Descanso del terreno'),
  ('Rotación de cultivos',          'Alternancia raíz / hoja / fruto'),
  ('Policultivo / Cultivos asociados', 'Asociación benéfica (ej. maíz-frijol)'),
  ('Policultivo / Cultivos asociados', 'Barreras vivas / repelentes'),
  ('Policultivo / Cultivos asociados', 'Cultivo intercalado'),
  ('Preparación de terreno',        'Removió maleza'),
  ('Preparación de terreno',        'Removió / aró el suelo'),
  ('Preparación de terreno',        'Niveló el terreno'),
  ('Preparación de terreno',        'Incorporó abono / compost'),
  ('Preparación de terreno',        'Armó camas / surcos'),
  ('Otro',                          'Otro (especificar en descripción)')
) AS m(tipo, nombre) ON m.tipo = tp.nombre
ON CONFLICT (tipo_practica_id, nombre) DO NOTHING;

-- ============================================================
-- 3) Actividades (catálogo) + dedicaciones (bitácora de horas)
--    Cada persona registra sus horas por biohuerto, fecha y actividad.
--    Soporta las tareas compartidas del huerto comunitario (limpieza, riego,
--    compostaje). El "cuántas personas participaron" sale de COUNT(DISTINCT usuario).
-- ============================================================
CREATE TABLE IF NOT EXISTS actividades (
  id         SMALLSERIAL PRIMARY KEY,
  codigo     VARCHAR(20)  NOT NULL UNIQUE,
  nombre     VARCHAR(60)  NOT NULL,
  es_sistema BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO actividades (codigo, nombre, es_sistema) VALUES
  ('limpieza',   'Limpieza',   TRUE),
  ('riego',      'Riego',      TRUE),
  ('compostaje', 'Compostaje', TRUE)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS dedicaciones (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),  -- UUID: registrable offline
  biohuerto_id UUID          NOT NULL REFERENCES biohuertos(id) ON DELETE CASCADE,
  usuario_id   BIGINT        NOT NULL REFERENCES usuarios(id)   ON DELETE RESTRICT,
  actividad_id SMALLINT      NOT NULL REFERENCES actividades(id),
  fecha        DATE          NOT NULL,
  horas        NUMERIC(5,2)  NOT NULL CHECK (horas > 0),
  observacion  VARCHAR(200)  NULL,
  last_synced_at TIMESTAMPTZ NULL,
  is_synced    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ   NULL
);

CREATE INDEX IF NOT EXISTS idx_dedicaciones_biohuerto ON dedicaciones(biohuerto_id);
CREATE INDEX IF NOT EXISTS idx_dedicaciones_usuario   ON dedicaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_dedicaciones_fecha     ON dedicaciones(fecha);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_dedicaciones_upd') THEN
    CREATE TRIGGER trg_dedicaciones_upd BEFORE UPDATE ON dedicaciones
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ============================================================
-- 4) Catálogos: unidad "hora" y categorías de costo de la ficha
-- ============================================================
INSERT INTO unidades (codigo, nombre, es_sistema)
SELECT 'hora', 'Hora', TRUE
WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE codigo = 'hora');

INSERT INTO categorias_costo (nombre)
SELECT nombre FROM (VALUES ('Semilla'), ('Abono'), ('Mejorador (vitamina)')) AS c(nombre)
WHERE NOT EXISTS (SELECT 1 FROM categorias_costo cc WHERE cc.nombre = c.nombre);

-- ============================================================
-- 5) Control de acceso: nueva vista "reportes.gestion" (solo admin)
-- ============================================================
INSERT INTO vistas (codigo, nombre, modulo, descripcion)
VALUES ('reportes.gestion', 'Reportes', 'reportes',
        'Reportes estadísticos: producción individual, por zona/comunidad, general, huella de carbono, sostenibilidad e inversión por biohuerto')
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    modulo = EXCLUDED.modulo,
    descripcion = EXCLUDED.descripcion,
    is_active = TRUE;

INSERT INTO vista_acciones (vista_id, accion_id)
SELECT v.id, a.id
FROM vistas v, acciones a
WHERE v.codigo = 'reportes.gestion'
  AND a.codigo IN ('ver_lista', 'ver_detalle', 'buscar', 'exportar')
ON CONFLICT DO NOTHING;

-- admin: acceso completo a la vista de reportes (explícito; una migración sobre
-- BD existente no hereda el permiso automáticamente como el seed inicial).
INSERT INTO rol_permisos (rol_id, vista_id, accion_id)
SELECT r.id, va.vista_id, va.accion_id
FROM roles r
JOIN vistas v ON v.codigo = 'reportes.gestion'
JOIN vista_acciones va ON va.vista_id = v.id
WHERE r.codigo = 'admin'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6) Privilegios para la app (las tablas nuevas no heredan grants previos)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON modalidades, actividades, metodos_practica, dedicaciones TO app_bio_user;
