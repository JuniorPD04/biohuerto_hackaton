-- ============================================================
--  init.sql — Esquema BIOHUERTO (normalizado, Junio 2026)
--  Generado a partir de hackaton_2026/bd/biohuerto_bd.sql
--  Envuelto en el modelo de roles: migration_user (dueño) /
--  app_bio_user (privilegios de la app).
-- ============================================================

-- Extensiones (requieren superusuario → se crean antes de SET ROLE)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_user') THEN
    CREATE ROLE migration_user LOGIN PASSWORD 'change-me-migration-password';
  ELSE
    ALTER ROLE migration_user WITH LOGIN PASSWORD 'change-me-migration-password';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_bio_user') THEN
    CREATE ROLE app_bio_user LOGIN PASSWORD 'change-me-app-password';
  ELSE
    ALTER ROLE app_bio_user WITH LOGIN PASSWORD 'change-me-app-password';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO app_bio_user', current_database());
  EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO migration_user', current_database());
END
$$;

GRANT USAGE  ON SCHEMA public TO migration_user;
GRANT CREATE ON SCHEMA public TO migration_user;
GRANT USAGE  ON SCHEMA public TO app_bio_user;

SET ROLE migration_user;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
--  BLOQUE 1 · CATÁLOGOS
-- ============================================================

-- 1.1  Roles de usuario
CREATE TABLE roles (
  id          SMALLSERIAL  PRIMARY KEY,
  codigo      VARCHAR(30)  NOT NULL UNIQUE,
  descripcion VARCHAR(120) NOT NULL
);
INSERT INTO roles(codigo, descripcion) VALUES
  ('admin',     'Administrador del sistema'),
  ('productor', 'Productor de biohuerto'),
  ('consumidor','Consumidor / comprador');

-- 1.2  Etapas fenológicas
CREATE TABLE etapas_fenologicas (
  id       SMALLSERIAL  PRIMARY KEY,
  codigo   VARCHAR(40)  NOT NULL UNIQUE,
  nombre   VARCHAR(80)  NOT NULL,
  orden    SMALLINT     NOT NULL UNIQUE,
  color_bg VARCHAR(10)  NULL,
  color_fg VARCHAR(10)  NULL
);
INSERT INTO etapas_fenologicas(codigo, nombre, orden, color_bg, color_fg) VALUES
  ('semillero',      'Semillero',      1, '#e7e9e6', '#5a625a'),
  ('crecimiento',    'Crecimiento',    2, '#dcefd7', '#2f6b34'),
  ('floracion',      'Floración',      3, '#fbf0c9', '#8a6b16'),
  ('fructificacion', 'Fructificación', 4, '#fbe2cd', '#9a5a23'),
  ('cosecha',        'Cosecha',        5, '#cfe8cd', '#1f5a2d'),
  ('finalizado',     'Finalizado',     6, '#dadcd8', '#4a4f49');

-- 1.2b  Especies (catálogo) — reemplaza el texto libre de cultivos.especie
--  El productor ELIGE la especie (no la escribe). Es la identidad sobre
--  la que se parametriza la fenología (1.2c).
--  es_sistema=TRUE: entrada oficial del catálogo. FALSE: agregada por
--  un usuario con "Agregar nuevo" (creado_por_id indica quién).
CREATE TABLE especies (
  id                SMALLSERIAL  PRIMARY KEY,
  nombre            VARCHAR(120) NOT NULL UNIQUE,
  nombre_cientifico VARCHAR(160) NULL,
  es_sistema        BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id     BIGINT       NULL,    -- FK diferida → usuarios (BLOQUE 2)
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE
);
INSERT INTO especies(nombre, nombre_cientifico, es_sistema) VALUES
  ('Lechuga',       'Lactuca sativa',        TRUE),
  ('Tomate',        'Solanum lycopersicum',  TRUE),
  ('Fresa',         'Fragaria × ananassa',   TRUE),
  ('Culantro',      'Coriandrum sativum',    TRUE),
  ('Espinaca',      'Spinacia oleracea',     TRUE),
  ('Rabanito',      'Raphanus sativus',      TRUE),
  ('Zanahoria',     'Daucus carota',         TRUE),
  ('Cebolla china', 'Allium fistulosum',     TRUE),
  ('Ají',           'Capsicum baccatum',     TRUE),
  ('Otro',          NULL,                    TRUE);

-- 1.2c  Fenología estandarizada por especie
--  Duración esperada (min/max días) de cada ETAPA para cada ESPECIE.
--  Ej: fresa permanece 5–10 días en 'fructificacion'. La app usa esto
--  para estimar la fecha de la próxima etapa y disparar alertas.
CREATE TABLE especie_etapas (
  id         SMALLSERIAL PRIMARY KEY,
  especie_id SMALLINT    NOT NULL REFERENCES especies(id)            ON DELETE CASCADE,
  etapa_id   SMALLINT    NOT NULL REFERENCES etapas_fenologicas(id),
  min_dias   SMALLINT    NOT NULL CHECK (min_dias >= 0),
  max_dias   SMALLINT    NOT NULL CHECK (max_dias >= min_dias),
  UNIQUE (especie_id, etapa_id)
);
-- Ejemplo de carga (rellenar con valores agronómicos reales por especie):
--   INSERT INTO especie_etapas(especie_id, etapa_id, min_dias, max_dias)
--   SELECT e.id, f.id, 5, 10
--   FROM especies e, etapas_fenologicas f
--   WHERE e.nombre = 'Fresa' AND f.codigo = 'fructificacion';

-- 1.3  Campañas / temporadas
CREATE TABLE campanias (
  id           SERIAL       PRIMARY KEY,
  nombre       VARCHAR(120) NOT NULL UNIQUE,
  fecha_inicio DATE         NOT NULL,
  fecha_fin    DATE         NOT NULL,
  is_active    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ  NULL,
  CHECK (fecha_fin >= fecha_inicio)
);

-- 1.4  Tipos de incidencia
CREATE TABLE tipos_incidencia (
  id     SMALLSERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);
INSERT INTO tipos_incidencia(nombre) VALUES
  ('Plaga'),('Enfermedad'),('Clima adverso'),
  ('Daño físico'),('Deficiencia nutricional'),('Otro');

-- 1.5  Categorías y tipos de práctica agrícola
--  sin_agroquimicos y es_sostenible son propiedades del TIPO → van aquí (3FN)
CREATE TABLE categorias_practica (
  id               SMALLSERIAL PRIMARY KEY,
  nombre           VARCHAR(40) NOT NULL UNIQUE,
  es_sostenible    BOOLEAN     NOT NULL DEFAULT TRUE,
  sin_agroquimicos BOOLEAN     NOT NULL DEFAULT TRUE
);
INSERT INTO categorias_practica(nombre, es_sostenible, sin_agroquimicos) VALUES
  ('Orgánica',  TRUE,  TRUE),
  ('Biológica', TRUE,  TRUE),
  ('Cultural',  TRUE,  FALSE);

CREATE TABLE tipos_practica (
  id           SMALLSERIAL  PRIMARY KEY,
  categoria_id SMALLINT     NOT NULL REFERENCES categorias_practica(id),
  nombre       VARCHAR(120) NOT NULL UNIQUE
);
INSERT INTO tipos_practica(categoria_id, nombre) VALUES
  (1,'Compost / Abono orgánico'),(1,'Abono verde'),(1,'Sin agroquímicos'),
  (2,'Control biológico'),(2,'Trampas para plagas'),
  (3,'Riego eficiente'),(3,'Poda sanitaria'),
  (3,'Rotación de cultivos'),(3,'Policultivo / Cultivos asociados'),(3,'Otro');

-- 1.6  Categorías de costo
CREATE TABLE categorias_costo (
  id     SMALLSERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);
INSERT INTO categorias_costo(nombre) VALUES
  ('Insumos'),('Agua'),('Mano de obra'),('Herramientas'),('Otros');

-- 1.7  Tipos de alerta
CREATE TABLE tipos_alerta (
  id     SMALLSERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);
INSERT INTO tipos_alerta(nombre) VALUES
  ('Riego'),('Fertilización'),('Control preventivo'),
  ('Cosecha'),('Rotación de cultivos'),('Otro');

-- 1.8  Factores de huella de carbono
--  fuente y unidad son VARCHAR atómicos: no tienen sub-atributos
--  propios que se consulten por separado → no justifican tabla (1FN OK)
CREATE TABLE factores_carbono (
  id            SMALLSERIAL   PRIMARY KEY,
  codigo        VARCHAR(60)   NOT NULL UNIQUE,
  descripcion   VARCHAR(200)  NOT NULL,
  valor         NUMERIC(10,6) NOT NULL,
  unidad        VARCHAR(60)   NOT NULL,
  fuente        VARCHAR(200)  NULL,
  vigente_desde DATE          NOT NULL DEFAULT CURRENT_DATE,
  vigente_hasta DATE          NULL,
  CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);
INSERT INTO factores_carbono(codigo, descripcion, valor, unidad, fuente) VALUES
  ('AGUA_RIEGO',   'Emisión por m³ de agua de riego',            0.344000,'kg CO₂/m³', 'IPCC Guidelines 2006'),
  ('COMPOST_RED',  'Reducción por kg de compost aplicado',        0.150000,'kg CO₂/kg', 'Lal, R. (2004)'),
  ('ABONO_VERDE',  'Reducción por kg de abono verde incorporado', 0.100000,'kg CO₂/kg', 'Lal, R. (2004)'),
  ('SIN_AGROQUIM', 'Reducción por m² sin agroquímicos',           0.500000,'kg CO₂/m²', 'FAO Agroecology 2018'),
  ('CTRL_BIO',     'Reducción por aplicación de control biológico',0.300000,'kg CO₂/ap','SENASA BPA Perú');

-- 1.9  Unidades de medida (catálogo extensible: "Agregar nuevo")
CREATE TABLE unidades (
  id            SMALLSERIAL  PRIMARY KEY,
  codigo        VARCHAR(20)  NOT NULL UNIQUE,
  nombre        VARCHAR(60)  NOT NULL,
  es_sistema    BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id BIGINT       NULL,    -- FK diferida → usuarios (BLOQUE 2)
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);
INSERT INTO unidades(codigo, nombre, es_sistema) VALUES
  ('und',    'Unidad',         TRUE),
  ('kg',     'Kilogramo',      TRUE),
  ('g',      'Gramo',          TRUE),
  ('L',      'Litro',          TRUE),
  ('mL',     'Mililitro',      TRUE),
  ('atado',  'Atado',          TRUE),
  ('manojo', 'Manojo',         TRUE),
  ('m2',     'Metro cuadrado', TRUE),
  ('planta', 'Planta',         TRUE),
  ('docena', 'Docena',         TRUE),
  ('saco',   'Saco',           TRUE);

-- 1.10  Insumos (catálogo extensible: "Agregar nuevo")
CREATE TABLE insumos (
  id            SMALLSERIAL  PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  es_sistema    BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id BIGINT       NULL,    -- FK diferida → usuarios (BLOQUE 2)
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);
INSERT INTO insumos(nombre, es_sistema) VALUES
  ('Compost', TRUE), ('Humus de lombriz', TRUE), ('Biol', TRUE), ('Ceniza', TRUE),
  ('Jabón potásico', TRUE), ('Caldo bordelés', TRUE), ('Cal agrícola', TRUE),
  ('Estiércol', TRUE), ('Abono verde', TRUE), ('Agua', TRUE);

-- 1.11  Zonas de la planta (catálogo extensible) — para incidencias
CREATE TABLE zonas_planta (
  id            SMALLSERIAL  PRIMARY KEY,
  nombre        VARCHAR(80)  NOT NULL,
  es_sistema    BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id BIGINT       NULL,    -- FK diferida → usuarios (BLOQUE 2)
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);
INSERT INTO zonas_planta(nombre, es_sistema) VALUES
  ('Hoja', TRUE), ('Tallo', TRUE), ('Raíz', TRUE), ('Fruto', TRUE),
  ('Flor', TRUE), ('Planta completa', TRUE), ('Otro', TRUE);

-- 1.12  Tipos de área de sembrío (catálogo extensible) — escalabilidad
--  El docente: por defecto 'biohuerto', pero el admin puede ampliar a
--  otros tipos (parcela, hectárea…) para que el sistema sea escalable.
CREATE TABLE tipos_area (
  id            SMALLSERIAL  PRIMARY KEY,
  codigo        VARCHAR(40)  NOT NULL UNIQUE,
  nombre        VARCHAR(80)  NOT NULL,
  es_sistema    BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id BIGINT       NULL,    -- FK diferida → usuarios (BLOQUE 2)
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);
INSERT INTO tipos_area(codigo, nombre, es_sistema) VALUES
  ('biohuerto',       'Biohuerto',       TRUE),
  ('parcela',         'Parcela',         TRUE),
  ('huerto_familiar', 'Huerto familiar', TRUE),
  ('invernadero',     'Invernadero',     TRUE),
  ('hectarea',        'Hectárea',        TRUE),
  ('otro',            'Otro',            TRUE);

-- 1.13  Fuentes de monitoreo (catálogo) — normaliza el origen del registro
CREATE TABLE fuentes_monitoreo (
  id     SMALLSERIAL PRIMARY KEY,
  codigo VARCHAR(20)  NOT NULL UNIQUE,
  nombre VARCHAR(60)  NOT NULL
);
INSERT INTO fuentes_monitoreo(codigo, nombre) VALUES
  ('iot',    'IoT'),
  ('manual', 'Manual');

-- ============================================================
--  BLOQUE 2 · USUARIOS Y BIOHUERTOS
-- ============================================================

-- 2.1  Usuarios
CREATE TABLE usuarios (
  id                  BIGSERIAL    PRIMARY KEY,
  rol_id              SMALLINT     NOT NULL REFERENCES roles(id),
  codigo              VARCHAR(20)  NOT NULL UNIQUE,
  nombre              VARCHAR(160) NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,
  password_hash       TEXT         NOT NULL,
  telefono_encrypted  BYTEA        NULL,
  direccion_encrypted BYTEA        NULL,
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ  NULL
);

-- FKs diferidas: "creado_por" de los catálogos extensibles (ya que usuarios existe)
ALTER TABLE especies     ADD CONSTRAINT fk_especies_creador  FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE unidades     ADD CONSTRAINT fk_unidades_creador  FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE insumos      ADD CONSTRAINT fk_insumos_creador   FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE zonas_planta ADD CONSTRAINT fk_zonas_creador     FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE tipos_area   ADD CONSTRAINT fk_tipos_area_creador FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;

-- 2.2  Biohuertos
CREATE TABLE biohuertos (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),  -- UUID: creable offline en campo
  tipo_area_id   SMALLINT      NOT NULL REFERENCES tipos_area(id),      -- biohuerto/parcela/… (por defecto 'biohuerto')
  codigo         VARCHAR(20)   NOT NULL UNIQUE,
  abreviatura    VARCHAR(20)   NULL,
  nombre         VARCHAR(160)  NOT NULL,
  descripcion    TEXT          NULL,
  ubicacion_referencia_encrypted BYTEA NULL,                           -- dirección textual cifrada (opcional)
  latitud        NUMERIC(9,6)  NULL,                                    -- GPS para mostrar en mapa
  longitud       NUMERIC(9,6)  NULL,
  area_m2        NUMERIC(10,2) NOT NULL CHECK (area_m2 > 0),
  estado         VARCHAR(20)   NOT NULL DEFAULT 'nuevo'
                 CHECK (estado IN ('nuevo','sembrado','en_tratamiento','activo','en_descanso','inactivo')),
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ   NULL,
  is_synced      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ   NULL
);

-- 2.4  Propietarios / administradores del biohuerto (N:M)
--  El docente: un biohuerto comunitario puede tener uno o más
--  propietarios/administradores; la asignación es opcional y posterior.
--  PK UUID → asignable offline en campo.
CREATE TABLE biohuerto_propietarios (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  biohuerto_id     UUID         NOT NULL REFERENCES biohuertos(id) ON DELETE CASCADE,
  propietario_id   BIGINT       NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
  rol              VARCHAR(20)  NOT NULL DEFAULT 'propietario'
                   CHECK (rol IN ('propietario','administrador')),
  fecha_asignacion DATE         NOT NULL DEFAULT CURRENT_DATE,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_synced_at   TIMESTAMPTZ  NULL,
  is_synced        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ  NULL,
  UNIQUE (biohuerto_id, propietario_id)
);

-- ============================================================
--  BLOQUE 3 · ARCHIVOS ADJUNTOS (imágenes en BYTEA)
--
--  Decisión: FKs directas por entidad en lugar de columna
--  polimórfica (entidad_tipo TEXT).
--  Razones:
--   - Integridad referencial real con ON DELETE CASCADE
--   - El query planner usa estadísticas reales de cada FK
--   - Evita el TEXT polimórfico sin FK que no puede verificarse en BD
--   - CHECK garantiza exactamente una FK activa por fila
--
--  Trade-off aceptado: añadir una nueva entidad con fotos
--  requiere ALTER TABLE para agregar columna.
-- ============================================================

CREATE TABLE archivos_adjuntos (
  id             BIGSERIAL    PRIMARY KEY,
  -- Exactamente una de estas FKs debe estar activa
  biohuerto_id   UUID         NULL REFERENCES biohuertos(id) ON DELETE CASCADE,
  cultivo_id     UUID         NULL,   -- FK diferida: cultivos aún no existe
  incidencia_id  UUID         NULL,   -- FK diferida: incidencias aún no existe
  diagnostico_id UUID         NULL,   -- FK diferida: diagnosticos aún no existe
  cosecha_id     UUID         NULL,   -- FK diferida: cosechas aún no existe
  usuario_id     BIGINT       NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre         VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(80)  NOT NULL,
  tamano_bytes   INTEGER      NOT NULL CHECK (tamano_bytes > 0),
  datos          BYTEA        NOT NULL,
  es_principal   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Garantiza que exactamente una FK esté activa
  CHECK (
    (biohuerto_id   IS NOT NULL)::INT +
    (cultivo_id     IS NOT NULL)::INT +
    (incidencia_id  IS NOT NULL)::INT +
    (diagnostico_id IS NOT NULL)::INT +
    (cosecha_id     IS NOT NULL)::INT +
    (usuario_id     IS NOT NULL)::INT = 1
  )
);
COMMENT ON TABLE archivos_adjuntos IS
  'Imágenes en BYTEA. FKs directas por entidad para garantizar integridad referencial.
   Las FKs a UUID (cultivo, incidencia, diagnostico, cosecha) se agregan con ALTER TABLE
   después de crear las tablas destino.';

-- ============================================================
--  BLOQUE 4 · CULTIVOS
-- ============================================================

-- 4.1  Cultivos
CREATE TABLE cultivos (
  id                     UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  biohuerto_id           UUID          NOT NULL REFERENCES biohuertos(id) ON DELETE RESTRICT,
  usuario_id             BIGINT        NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  campania_id            INTEGER       NULL REFERENCES campanias(id) ON DELETE SET NULL,
  etapa_id               SMALLINT      NOT NULL REFERENCES etapas_fenologicas(id),
  especie_id             SMALLINT      NOT NULL REFERENCES especies(id),
  variedad               VARCHAR(120)  NULL,
  fecha_siembra          DATE          NOT NULL,
  fecha_estimada_cosecha DATE          NULL,
  cantidad               NUMERIC(10,2) NULL CHECK (cantidad IS NULL OR cantidad >= 0),
  unidad_id              SMALLINT      NOT NULL REFERENCES unidades(id),
  area_m2                NUMERIC(10,2) NULL CHECK (area_m2 IS NULL OR area_m2 > 0),
  notas                  TEXT          NULL,
  is_active              BOOLEAN       NOT NULL DEFAULT TRUE,
  last_synced_at         TIMESTAMPTZ   NULL,
  is_synced              BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ   NULL
);

-- 4.2  Ahora que cultivos existe, agregamos las FKs diferidas
ALTER TABLE archivos_adjuntos
  ADD CONSTRAINT fk_adj_cultivo     FOREIGN KEY (cultivo_id)
    REFERENCES cultivos(id)     ON DELETE CASCADE;

-- 4.3  Historial de etapas por cultivo
CREATE TABLE cultivos_historial_etapas (
  id          BIGSERIAL    PRIMARY KEY,
  cultivo_id  UUID         NOT NULL REFERENCES cultivos(id) ON DELETE CASCADE,
  etapa_id    SMALLINT     NOT NULL REFERENCES etapas_fenologicas(id),
  fecha       DATE         NOT NULL,
  titulo      VARCHAR(160) NOT NULL,
  observacion TEXT         NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 4.4  Asignación de productores a cultivos (N:M)
--  Un cultivo puede ser atendido por varios productores y un productor
--  por varios cultivos. `cultivos.usuario_id` sigue siendo "quién lo
--  registró"; esta tabla es "quién está asignado a trabajarlo".
--  PK UUID → asignable offline en campo.
CREATE TABLE cultivo_asignaciones (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  cultivo_id       UUID         NOT NULL REFERENCES cultivos(id) ON DELETE CASCADE,
  productor_id     BIGINT       NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol_en_cultivo   VARCHAR(40)  NOT NULL DEFAULT 'responsable'
                   CHECK (rol_en_cultivo IN ('responsable','apoyo','observador')),
  fecha_asignacion DATE         NOT NULL DEFAULT CURRENT_DATE,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_synced_at   TIMESTAMPTZ  NULL,
  is_synced        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ  NULL,
  UNIQUE (cultivo_id, productor_id)
);

-- ============================================================
--  BLOQUE 5 · MONITOREO E INCIDENCIAS
-- ============================================================

-- 5.1  Registros de monitoreo de variables ambientales
--  fuente normalizada con el catálogo fuentes_monitoreo (BLOQUE 1.13).
--  luminosidad_nivel eliminada: derivada de luminosidad_lux → viola 3FN
CREATE TABLE monitoreo_registros (
  id              UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
  cultivo_id      UUID                  NOT NULL REFERENCES cultivos(id) ON DELETE CASCADE,
  fuente_id       SMALLINT              NOT NULL REFERENCES fuentes_monitoreo(id),
  usuario_id      BIGINT                NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  sensor_codigo   VARCHAR(40)           NULL,
  registrado_en   TIMESTAMPTZ           NOT NULL DEFAULT now(),
  humedad_pct     NUMERIC(5,2)          NULL CHECK (humedad_pct    IS NULL OR humedad_pct    BETWEEN 0 AND 100),
  temperatura_c   NUMERIC(5,2)          NULL CHECK (temperatura_c  IS NULL OR temperatura_c  BETWEEN -10 AND 60),
  luminosidad_lux NUMERIC(10,2)         NULL CHECK (luminosidad_lux IS NULL OR luminosidad_lux >= 0),
  ph_suelo        NUMERIC(4,2)          NULL CHECK (ph_suelo        IS NULL OR ph_suelo        BETWEEN 0 AND 14),
  observacion     TEXT                  NULL,
  nota_ajuste     TEXT                  NULL,
  last_synced_at  TIMESTAMPTZ           NULL,
  is_synced       BOOLEAN               NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ           NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ           NULL
);
COMMENT ON COLUMN monitoreo_registros.luminosidad_lux IS
  'El nivel (Alta/Media/Baja) se deriva en la app con CASE WHEN. No se almacena (3FN).';
COMMENT ON COLUMN monitoreo_registros.sensor_codigo IS
  'NULL si fuente=manual. Identifica el sensor físico si fuente=iot.';

-- 5.3  Incidencias
CREATE TABLE incidencias (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  cultivo_id    UUID        NOT NULL REFERENCES cultivos(id) ON DELETE CASCADE,
  tipo_id       SMALLINT    NOT NULL REFERENCES tipos_incidencia(id),
  usuario_id    BIGINT      NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  descripcion   TEXT        NOT NULL,
  severidad     VARCHAR(10) NOT NULL DEFAULT 'media'
                CHECK (severidad IN ('baja','media','alta')),
  zona_id       SMALLINT    NULL REFERENCES zonas_planta(id),
  estado        VARCHAR(20) NOT NULL DEFAULT 'abierta'
                CHECK (estado IN ('abierta','en_revision','cerrada')),
  reportado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ NULL,
  is_synced     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ NULL
);

-- FK diferida para incidencias
ALTER TABLE archivos_adjuntos
  ADD CONSTRAINT fk_adj_incidencia   FOREIGN KEY (incidencia_id)
    REFERENCES incidencias(id)  ON DELETE CASCADE;

-- ============================================================
--  BLOQUE 6 · DIAGNÓSTICO FITOSANITARIO
-- ============================================================

-- 6.1  Diagnósticos
CREATE TABLE diagnosticos (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  cultivo_id            UUID         NULL REFERENCES cultivos(id)    ON DELETE SET NULL,
  incidencia_id         UUID         NULL REFERENCES incidencias(id) ON DELETE SET NULL,
  usuario_id            BIGINT       NULL REFERENCES usuarios(id)    ON DELETE SET NULL,
  parte_planta          VARCHAR(40)  NULL
                        CHECK (parte_planta IN ('Hoja','Fruto','Tallo','Raíz','Planta completa')),
  observaciones_previas TEXT         NULL,
  modelo_usado          VARCHAR(120) NOT NULL DEFAULT 'ia-vision',
  enfermedad_detectada  VARCHAR(200) NULL,
  nombre_cientifico     VARCHAR(200) NULL,
  confianza_pct         NUMERIC(5,2) NULL
                        CHECK (confianza_pct IS NULL OR confianza_pct BETWEEN 0 AND 100),
  nivel_riesgo          VARCHAR(10)  NULL
                        CHECK (nivel_riesgo IN ('bajo','medio','alto')),
  guardado              BOOLEAN      NOT NULL DEFAULT FALSE,
  last_synced_at        TIMESTAMPTZ  NULL,
  is_synced             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ  NULL
);
COMMENT ON COLUMN diagnosticos.cultivo_id IS
  'NULL si el diagnóstico se lanzó desde el módulo global sin asociar cultivo.';

-- FK diferida para diagnósticos
ALTER TABLE archivos_adjuntos
  ADD CONSTRAINT fk_adj_diagnostico  FOREIGN KEY (diagnostico_id)
    REFERENCES diagnosticos(id) ON DELETE CASCADE;

-- 6.2  Alternativas del diagnóstico (normaliza JSONB → 1FN)
CREATE TABLE diagnostico_alternativas (
  id             BIGSERIAL    PRIMARY KEY,
  diagnostico_id UUID         NOT NULL REFERENCES diagnosticos(id) ON DELETE CASCADE,
  enfermedad     VARCHAR(200) NOT NULL,
  confianza_pct  NUMERIC(5,2) NOT NULL CHECK (confianza_pct BETWEEN 0 AND 100),
  orden          SMALLINT     NOT NULL
);

-- ============================================================
--  BLOQUE 7 · RECOMENDACIONES
-- ============================================================

CREATE TABLE recomendaciones (
  id             BIGSERIAL    PRIMARY KEY,
  cultivo_id     UUID         NULL REFERENCES cultivos(id)     ON DELETE SET NULL,
  diagnostico_id UUID         NULL REFERENCES diagnosticos(id) ON DELETE SET NULL,
  titulo         VARCHAR(200) NOT NULL,
  cuerpo         TEXT         NOT NULL,
  prioridad      VARCHAR(15)  NOT NULL DEFAULT 'recomendada'
                 CHECK (prioridad IN ('urgente','importante','recomendada')),
  categoria      VARCHAR(80)  NOT NULL,
  tipo_manejo    VARCHAR(20)  NOT NULL DEFAULT 'organico'
                 CHECK (tipo_manejo IN ('organico','biologico','cultural')),
  fuente         VARCHAR(200) NULL,
  origen         VARCHAR(20)  NOT NULL DEFAULT 'rag'
                 CHECK (origen IN ('rag','manual','diagnostico')),
  aplicada       BOOLEAN      NOT NULL DEFAULT FALSE,
  aplicada_en    TIMESTAMPTZ  NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ  NULL
);

-- ============================================================
--  BLOQUE 7.1 · RAG (recomendaciones por embeddings, OpenAI + pgvector)
-- ============================================================

-- Fragmentos del documento FAO/IPES "Biopreparados para el manejo
-- sostenible de plagas y enfermedades" embebidos con OpenAI
-- text-embedding-3-small (1536 dim).
CREATE TABLE rag_chunks (
  id          BIGSERIAL    PRIMARY KEY,
  fuente      VARCHAR(200) NOT NULL,
  chunk_index INT          NOT NULL,
  contenido   TEXT         NOT NULL,
  embedding   VECTOR(1536) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_rag_chunks_embedding ON rag_chunks
  USING hnsw (embedding vector_cosine_ops);

-- ============================================================
--  BLOQUE 8 · PRÁCTICAS AGRÍCOLAS
-- ============================================================

--  sin_agroquimicos y es_sostenible se obtienen con:
--  JOIN tipos_practica tp ON tp.id = tipo_id
--  JOIN categorias_practica cp ON cp.id = tp.categoria_id
--  No se almacenan aquí → 3FN
CREATE TABLE practicas_agricolas (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),  -- UUID: registrable offline en campo
  cultivo_id       UUID          NOT NULL REFERENCES cultivos(id)   ON DELETE CASCADE,
  usuario_id       BIGINT        NULL REFERENCES usuarios(id)       ON DELETE SET NULL,
  tipo_id          SMALLINT      NOT NULL REFERENCES tipos_practica(id),
  descripcion      TEXT          NOT NULL,
  insumo_id        SMALLINT      NULL REFERENCES insumos(id),
  cantidad         NUMERIC(10,2) NULL CHECK (cantidad IS NULL OR cantidad >= 0),
  unidad_id        SMALLINT      NULL REFERENCES unidades(id),
  fecha_aplicacion DATE          NOT NULL,
  last_synced_at   TIMESTAMPTZ   NULL,
  is_synced        BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ   NULL
);

-- ============================================================
--  BLOQUE 9 · COSTOS DE PRODUCCIÓN
-- ============================================================

--  costo_por_m2, costo_por_unidad y margen_estimado son SELECTs
--  calculados → no se almacenan
CREATE TABLE costos_produccion (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),  -- UUID: registrable offline en campo
  cultivo_id   UUID          NOT NULL REFERENCES cultivos(id)      ON DELETE CASCADE,
  usuario_id   BIGINT        NULL REFERENCES usuarios(id)          ON DELETE SET NULL,
  categoria_id SMALLINT      NOT NULL REFERENCES categorias_costo(id),
  descripcion  VARCHAR(200)  NOT NULL,
  cantidad     NUMERIC(10,2) NULL CHECK (cantidad IS NULL OR cantidad >= 0),
  unidad_id    SMALLINT      NULL REFERENCES unidades(id),
  monto        NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
  moneda       CHAR(3)       NOT NULL DEFAULT 'PEN',
  fecha        DATE          NOT NULL,
  last_synced_at TIMESTAMPTZ NULL,
  is_synced    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ   NULL
);

-- ============================================================
--  BLOQUE 10 · ALERTAS
-- ============================================================

CREATE TABLE alertas (
  id               BIGSERIAL    PRIMARY KEY,
  cultivo_id       UUID         NULL REFERENCES cultivos(id)    ON DELETE CASCADE,
  biohuerto_id     UUID         NULL REFERENCES biohuertos(id)  ON DELETE CASCADE,
  usuario_id       BIGINT       NULL REFERENCES usuarios(id)    ON DELETE SET NULL,
  tipo_id          SMALLINT     NOT NULL REFERENCES tipos_alerta(id),
  titulo           VARCHAR(200) NOT NULL,
  descripcion      TEXT         NULL,
  prioridad        SMALLINT     NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 1 AND 3),
  estado           VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','completada','descartada')),
  fecha_programada TIMESTAMPTZ  NOT NULL,
  es_automatica    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ  NULL
);
COMMENT ON COLUMN alertas.prioridad IS '1=baja, 2=media, 3=alta';

-- ============================================================
--  BLOQUE 10B · CUIDADOS DEL CULTIVO
-- ============================================================
CREATE TABLE cuidados (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  cultivo_id       UUID         NOT NULL REFERENCES cultivos(id) ON DELETE CASCADE,
  tipo_id          SMALLINT     NOT NULL REFERENCES tipos_alerta(id),
  descripcion      VARCHAR(200) NULL,
  frecuencia_dias  SMALLINT     NOT NULL CHECK (frecuencia_dias > 0),
  ultima_realizada TIMESTAMPTZ  NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_synced_at   TIMESTAMPTZ  NULL,
  is_synced        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ  NULL
);

ALTER TABLE alertas
  ADD COLUMN vista BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN cuidado_id UUID NULL REFERENCES cuidados(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX uq_alertas_cuidado_pendiente
  ON alertas (cuidado_id)
  WHERE estado = 'pendiente' AND deleted_at IS NULL;

-- ============================================================
--  BLOQUE 11 · COSECHAS Y OFERTAS
-- ============================================================

--  disponible + publicado unificados en estado (elimina solapamiento lógico)
CREATE TABLE cosechas (
  id                 UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  cultivo_id         UUID          NULL REFERENCES cultivos(id)  ON DELETE SET NULL,
  usuario_id         BIGINT        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  nombre_producto    VARCHAR(140)  NOT NULL,
  cantidad           NUMERIC(10,2) NOT NULL CHECK (cantidad >= 0),
  unidad_id          SMALLINT      NOT NULL REFERENCES unidades(id),
  precio_referencial NUMERIC(10,2) NOT NULL CHECK (precio_referencial >= 0),
  fecha_cosecha      DATE          NOT NULL,
  link_whatsapp      TEXT          NULL,
  telefono_encrypted BYTEA         NULL,
  estado             VARCHAR(20)   NOT NULL DEFAULT 'disponible'
                     CHECK (estado IN ('disponible','publicado','agotado','baja')),
  published_at       TIMESTAMPTZ   NULL,
  last_synced_at     TIMESTAMPTZ   NULL,
  is_synced          BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ   NULL
);
COMMENT ON TABLE cosechas IS
  'Un productor puede publicar muchas cosechas.
   La foto del producto va en archivos_adjuntos con cosecha_id.';

-- FK diferida para cosechas
ALTER TABLE archivos_adjuntos
  ADD CONSTRAINT fk_adj_cosecha      FOREIGN KEY (cosecha_id)
    REFERENCES cosechas(id)     ON DELETE CASCADE;

-- Interés de consumidor en cosecha publicada
CREATE TABLE cosechas_intereses (
  id            BIGSERIAL   PRIMARY KEY,
  cosecha_id    UUID        NOT NULL REFERENCES cosechas(id)   ON DELETE CASCADE,
  consumidor_id BIGINT      NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
  mensaje       TEXT        NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cosecha_id, consumidor_id)
);

-- ============================================================
--  BLOQUE 12 · HUELLA DE CARBONO
-- ============================================================

--  incidencias_graves, dias_sin_monitoreo, pct_practicas_organicas,
--  consumo_agua_m3_por_m2, sin_agroquimicos → son SELECTs, no columnas.
--  Los resultados parciales SÍ se guardan: snapshot justificado para
--  reproducibilidad histórica cuando los factores cambien.
CREATE TABLE huella_carbono (
  id                  BIGSERIAL     PRIMARY KEY,
  cultivo_id          UUID          NOT NULL REFERENCES cultivos(id)  ON DELETE CASCADE,
  usuario_id          BIGINT        NULL REFERENCES usuarios(id)      ON DELETE SET NULL,
  periodo_inicio      DATE          NOT NULL,
  periodo_fin         DATE          NOT NULL,
  huella_neta_kg_co2  NUMERIC(10,4) NOT NULL DEFAULT 0,
  semaforo_ambiental  VARCHAR(10)   NOT NULL DEFAULT 'verde'
                      CHECK (semaforo_ambiental IN ('verde','amarillo','rojo')),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (periodo_fin >= periodo_inicio)
);
COMMENT ON TABLE huella_carbono IS
  'Cabecera del cálculo de huella por cultivo y período. El desglose por
   componente (entrada + factor usado + resultado) va en huella_componentes.';

-- 12.1  Componentes del cálculo de huella (un registro por componente)
--  Normaliza el grupo repetido entrada+factor+resultado × 5 componentes.
--  factor_id es la ÚNICA referencia a factores_carbono (relación 1:N limpia).
CREATE TABLE huella_componentes (
  id               BIGSERIAL     PRIMARY KEY,
  huella_id        BIGINT        NOT NULL REFERENCES huella_carbono(id) ON DELETE CASCADE,
  tipo             VARCHAR(20)   NOT NULL
                   CHECK (tipo IN ('agua','compost','abono_verde','sin_agroquim','ctrl_bio')),
  cantidad         NUMERIC(10,3) NOT NULL DEFAULT 0,   -- entrada: m³, kg, m², aplicaciones
  factor_id        SMALLINT      NOT NULL REFERENCES factores_carbono(id),
  resultado_kg_co2 NUMERIC(10,4) NOT NULL DEFAULT 0,   -- emisión o reducción del componente
  UNIQUE (huella_id, tipo)
);

-- ============================================================
--  BLOQUE 13 · SINCRONIZACIÓN OFFLINE
--
--  Soporte offline-first: el cliente crea/edita registros sin
--  conexión y los encola aquí. Al recuperar red, un worker
--  procesa la cola (upsert por record_uuid) y marca is_synced.
--
--  Solo las tablas con PK UUID participan (id generable en el
--  cliente sin colisión): biohuertos, cultivos, monitoreo_registros,
--  incidencias, diagnosticos, cosechas, cuidados,
--  practicas_agricolas, costos_produccion, cultivo_asignaciones,
--  biohuerto_propietarios.
--  Esas tablas llevan last_synced_at + is_synced.
-- ============================================================
CREATE TABLE sync_queue (
  id               BIGSERIAL    PRIMARY KEY,
  tabla            VARCHAR(80)  NOT NULL,
  record_uuid      UUID         NOT NULL,
  operation        VARCHAR(20)  NOT NULL DEFAULT 'upsert'
                   CHECK (operation IN ('upsert','update')),
  payload          JSONB        NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','synced','conflict','error')),
  error_message    TEXT         NULL,
  created_at_local TIMESTAMPTZ  NOT NULL,   -- timestamp del dispositivo al crear el registro offline
  processed_at     TIMESTAMPTZ  NULL,
  last_synced_at   TIMESTAMPTZ  NULL,
  is_synced        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ  NULL
);
COMMENT ON TABLE sync_queue IS
  'Cola de sincronización diferida para registros creados/editados offline.
   record_uuid referencia (soft, sin FK) la PK UUID de la tabla en `tabla`.';

-- ============================================================
--  BLOQUE 14 · CONTROL DE ACCESO POR ROL (vistas y acciones)
--
--  Configura, por ROL (admin/productor/consumidor), qué VISTAS puede
--  ver y qué ACCIONES puede realizar en cada una. Un rol "ve" una
--  vista si tiene ≥1 permiso sobre ella (típicamente 'ver_lista').
--  Sin filas para una vista = sin acceso. Config del servidor
--  (read-only en el cliente, no entra al flujo offline).
-- ============================================================

-- 14.1  Vistas (pantallas / módulos del app)
CREATE TABLE vistas (
  id          SMALLSERIAL  PRIMARY KEY,
  codigo      VARCHAR(80)  NOT NULL UNIQUE,   -- ej. 'incidencias.gestion', 'productores.lista'
  nombre      VARCHAR(120) NOT NULL,
  modulo      VARCHAR(60)  NULL,
  descripcion VARCHAR(200) NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 14.2  Acciones posibles sobre una vista
CREATE TABLE acciones (
  id     SMALLSERIAL PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL UNIQUE,
  nombre VARCHAR(80) NOT NULL
);
INSERT INTO acciones(codigo, nombre) VALUES
  ('ver_lista',   'Ver lista'),
  ('ver_detalle', 'Ver detalle'),
  ('crear',       'Crear / Agregar'),
  ('editar',      'Editar'),
  ('eliminar',    'Eliminar'),
  ('dar_baja',    'Dar de baja'),
  ('restaurar',   'Restaurar / Reactivar'),
  ('buscar',      'Buscar / Filtrar'),
  ('exportar',    'Exportar');

-- 14.3  Acciones APLICABLES a cada vista (el "menú" de lo asignable)
--  Declara qué acciones tienen sentido en cada vista. Evita asignar,
--  p.ej., 'exportar' a una vista que no exporta. Es el conjunto sobre
--  el que rol_permisos puede conceder permisos.
CREATE TABLE vista_acciones (
  id        SMALLSERIAL PRIMARY KEY,
  vista_id  SMALLINT    NOT NULL REFERENCES vistas(id)   ON DELETE CASCADE,
  accion_id SMALLINT    NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  UNIQUE (vista_id, accion_id)
);

-- 14.4  Permisos: acción (de las aplicables) que un rol puede ejercer
--  La FK compuesta (vista_id, accion_id) → vista_acciones garantiza
--  que solo se concede una acción declarada aplicable a esa vista.
CREATE TABLE rol_permisos (
  id         BIGSERIAL    PRIMARY KEY,
  rol_id     SMALLINT     NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  vista_id   SMALLINT     NOT NULL,
  accion_id  SMALLINT     NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (rol_id, vista_id, accion_id),
  FOREIGN KEY (vista_id, accion_id)
    REFERENCES vista_acciones(vista_id, accion_id) ON DELETE CASCADE
);

-- Ejemplo de configuración (se carga en el seed):
--   INSERT INTO vistas(codigo, nombre, modulo) VALUES
--     ('productores.lista',   'Lista de productores',   'usuarios'),
--     ('incidencias.gestion', 'Gestión de incidencias', 'incidencias');
--   -- 1) Declarar qué acciones aplican a cada vista:
--   INSERT INTO vista_acciones(vista_id, accion_id)
--     SELECT v.id, a.id FROM vistas v, acciones a
--     WHERE v.codigo='productores.lista'
--       AND a.codigo IN ('ver_lista','ver_detalle','dar_baja','eliminar');
--   INSERT INTO vista_acciones(vista_id, accion_id)
--     SELECT v.id, a.id FROM vistas v, acciones a
--     WHERE v.codigo='incidencias.gestion'
--       AND a.codigo IN ('ver_lista','ver_detalle','crear','editar','eliminar');
--   -- 2) El productor SOLO ve lista y detalle de productores:
--   INSERT INTO rol_permisos(rol_id, vista_id, accion_id)
--     SELECT r.id, v.id, a.id FROM roles r, vistas v, acciones a
--     WHERE r.codigo='productor' AND v.codigo='productores.lista'
--       AND a.codigo IN ('ver_lista','ver_detalle');
--   -- El productor gestiona incidencias por completo:
--   INSERT INTO rol_permisos(rol_id, vista_id, accion_id)
--     SELECT r.id, v.id, a.id FROM roles r, vistas v, acciones a
--     WHERE r.codigo='productor' AND v.codigo='incidencias.gestion'
--       AND a.codigo IN ('ver_lista','ver_detalle','crear','editar','eliminar');

-- ============================================================
--  ÍNDICES
-- ============================================================
CREATE INDEX idx_usuarios_rol         ON usuarios(rol_id);
CREATE INDEX idx_usuarios_active      ON usuarios(is_active);
CREATE INDEX idx_biohuertos_tipo      ON biohuertos(tipo_area_id);
CREATE INDEX idx_biohuertos_estado    ON biohuertos(estado);
CREATE INDEX idx_biohuertos_active    ON biohuertos(is_active);
CREATE INDEX idx_biohpropiet_biohuerto   ON biohuerto_propietarios(biohuerto_id);
CREATE INDEX idx_biohpropiet_propietario ON biohuerto_propietarios(propietario_id);
CREATE INDEX idx_cultivos_biohuerto   ON cultivos(biohuerto_id);
CREATE INDEX idx_cultivos_campania    ON cultivos(campania_id);
CREATE INDEX idx_cultivos_etapa       ON cultivos(etapa_id);
CREATE INDEX idx_cultivos_especie     ON cultivos(especie_id);
CREATE INDEX idx_cultivos_usuario     ON cultivos(usuario_id);
CREATE INDEX idx_cultivos_active      ON cultivos(is_active);
CREATE INDEX idx_cultivos_siembra     ON cultivos(fecha_siembra);
CREATE INDEX idx_historial_cultivo    ON cultivos_historial_etapas(cultivo_id);
CREATE INDEX idx_asignaciones_cultivo   ON cultivo_asignaciones(cultivo_id);
CREATE INDEX idx_asignaciones_productor ON cultivo_asignaciones(productor_id);
CREATE INDEX idx_especie_etapas_especie ON especie_etapas(especie_id);
CREATE INDEX idx_monitoreo_cultivo    ON monitoreo_registros(cultivo_id);
CREATE INDEX idx_monitoreo_fecha      ON monitoreo_registros(registrado_en DESC);
CREATE INDEX idx_monitoreo_fuente     ON monitoreo_registros(fuente_id);
CREATE INDEX idx_incidencias_cultivo  ON incidencias(cultivo_id);
CREATE INDEX idx_incidencias_tipo     ON incidencias(tipo_id);
CREATE INDEX idx_incidencias_estado   ON incidencias(estado);
CREATE INDEX idx_incidencias_zona     ON incidencias(zona_id);
CREATE INDEX idx_diag_cultivo         ON diagnosticos(cultivo_id);
CREATE INDEX idx_diag_incidencia      ON diagnosticos(incidencia_id);
CREATE INDEX idx_diag_alt             ON diagnostico_alternativas(diagnostico_id);
CREATE INDEX idx_recom_cultivo        ON recomendaciones(cultivo_id);
CREATE INDEX idx_recom_diagnostico    ON recomendaciones(diagnostico_id);
CREATE INDEX idx_recom_aplicada       ON recomendaciones(aplicada);
CREATE INDEX idx_practicas_cultivo    ON practicas_agricolas(cultivo_id);
CREATE INDEX idx_practicas_tipo       ON practicas_agricolas(tipo_id);
CREATE INDEX idx_practicas_insumo     ON practicas_agricolas(insumo_id);
CREATE INDEX idx_practicas_fecha      ON practicas_agricolas(fecha_aplicacion);
CREATE INDEX idx_costos_cultivo       ON costos_produccion(cultivo_id);
CREATE INDEX idx_costos_categoria     ON costos_produccion(categoria_id);
CREATE INDEX idx_costos_fecha         ON costos_produccion(fecha);
CREATE INDEX idx_alertas_cultivo      ON alertas(cultivo_id);
CREATE INDEX idx_alertas_biohuerto    ON alertas(biohuerto_id);
CREATE INDEX idx_alertas_estado_fecha ON alertas(estado, fecha_programada);
CREATE INDEX idx_alertas_prioridad    ON alertas(prioridad DESC);
CREATE INDEX idx_cosechas_usuario     ON cosechas(usuario_id);
CREATE INDEX idx_cosechas_cultivo     ON cosechas(cultivo_id);
CREATE INDEX idx_cosechas_estado      ON cosechas(estado);
CREATE INDEX idx_intereses_cosecha    ON cosechas_intereses(cosecha_id);
CREATE INDEX idx_intereses_consumidor ON cosechas_intereses(consumidor_id);
CREATE INDEX idx_huella_cultivo       ON huella_carbono(cultivo_id);
CREATE INDEX idx_huella_periodo       ON huella_carbono(periodo_inicio, periodo_fin);
CREATE INDEX idx_huella_comp_huella   ON huella_componentes(huella_id);
CREATE INDEX idx_huella_comp_factor   ON huella_componentes(factor_id);
-- Índices para archivos_adjuntos por cada FK
CREATE INDEX idx_adj_biohuerto        ON archivos_adjuntos(biohuerto_id)   WHERE biohuerto_id   IS NOT NULL;
CREATE INDEX idx_adj_cultivo          ON archivos_adjuntos(cultivo_id)     WHERE cultivo_id     IS NOT NULL;
CREATE INDEX idx_adj_incidencia       ON archivos_adjuntos(incidencia_id)  WHERE incidencia_id  IS NOT NULL;
CREATE INDEX idx_adj_diagnostico      ON archivos_adjuntos(diagnostico_id) WHERE diagnostico_id IS NOT NULL;
CREATE INDEX idx_adj_cosecha          ON archivos_adjuntos(cosecha_id)     WHERE cosecha_id     IS NOT NULL;
CREATE INDEX idx_adj_usuario          ON archivos_adjuntos(usuario_id)     WHERE usuario_id     IS NOT NULL;
CREATE INDEX idx_adj_principal        ON archivos_adjuntos(cultivo_id, es_principal) WHERE es_principal = TRUE;
-- Índices de sincronización offline (registros pendientes de subir)
CREATE INDEX idx_biohuertos_sync      ON biohuertos(is_synced)          WHERE is_synced = FALSE;
CREATE INDEX idx_cultivos_sync        ON cultivos(is_synced)            WHERE is_synced = FALSE;
CREATE INDEX idx_monitoreo_sync       ON monitoreo_registros(is_synced) WHERE is_synced = FALSE;
CREATE INDEX idx_incidencias_sync     ON incidencias(is_synced)         WHERE is_synced = FALSE;
CREATE INDEX idx_diagnosticos_sync    ON diagnosticos(is_synced)        WHERE is_synced = FALSE;
CREATE INDEX idx_cosechas_sync        ON cosechas(is_synced)            WHERE is_synced = FALSE;
CREATE INDEX idx_cuidados_sync        ON cuidados(is_synced)            WHERE is_synced = FALSE;
CREATE INDEX idx_practicas_sync       ON practicas_agricolas(is_synced) WHERE is_synced = FALSE;
CREATE INDEX idx_costos_sync          ON costos_produccion(is_synced)   WHERE is_synced = FALSE;
CREATE INDEX idx_asignaciones_sync    ON cultivo_asignaciones(is_synced) WHERE is_synced = FALSE;
CREATE INDEX idx_biohpropiet_sync     ON biohuerto_propietarios(is_synced) WHERE is_synced = FALSE;
-- Control de acceso por rol
CREATE INDEX idx_rol_permisos_rol     ON rol_permisos(rol_id);
CREATE INDEX idx_rol_permisos_vista   ON rol_permisos(vista_id);
-- Índices de la cola de sincronización
CREATE INDEX idx_sync_queue_record    ON sync_queue(record_uuid);
CREATE INDEX idx_sync_queue_status    ON sync_queue(status)             WHERE status = 'pending';
CREATE INDEX idx_sync_queue_tabla     ON sync_queue(tabla);

-- ============================================================
--  TRIGGERS updated_at
-- ============================================================
CREATE TRIGGER trg_campanias_upd      BEFORE UPDATE ON campanias             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_usuarios_upd       BEFORE UPDATE ON usuarios              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_biohuertos_upd     BEFORE UPDATE ON biohuertos            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cultivos_upd       BEFORE UPDATE ON cultivos              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_asignaciones_upd   BEFORE UPDATE ON cultivo_asignaciones  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_biohpropiet_upd    BEFORE UPDATE ON biohuerto_propietarios FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_monitoreo_upd      BEFORE UPDATE ON monitoreo_registros   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_incidencias_upd    BEFORE UPDATE ON incidencias           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_diagnosticos_upd   BEFORE UPDATE ON diagnosticos          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recom_upd          BEFORE UPDATE ON recomendaciones       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_practicas_upd      BEFORE UPDATE ON practicas_agricolas   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_costos_upd         BEFORE UPDATE ON costos_produccion     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_alertas_upd        BEFORE UPDATE ON alertas               FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cosechas_upd       BEFORE UPDATE ON cosechas              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_huella_upd         BEFORE UPDATE ON huella_carbono        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_queue_upd     BEFORE UPDATE ON sync_queue            FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
--  PRIVILEGIOS PARA LA APP (app_bio_user)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_bio_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES  IN SCHEMA public TO app_bio_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO app_bio_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT                  ON SEQUENCES TO app_bio_user;

RESET ROLE;
