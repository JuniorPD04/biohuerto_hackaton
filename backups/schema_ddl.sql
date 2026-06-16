-- ============================================================
--  schema_ddl.sql — DDL ESTRUCTURAL BIOHUERTO (solo para DER)
--  Extraído de init.sql. Contiene únicamente:
--    · CREATE TYPE (enums usados como tipos de columna)
--    · CREATE TABLE
--    · ALTER TABLE (FKs diferidas y columnas estructurales)
--  Excluye: roles/grants (DCL), extensiones, INSERT (seeds),
--           funciones, triggers, índices.  → ver schema_extras.sql
-- ============================================================

-- ============================================================
--  CATÁLOGO: fuentes de monitoreo (antes era un ENUM; normalizado a tabla)
-- ============================================================
CREATE TABLE fuentes_monitoreo (
  id     SMALLSERIAL PRIMARY KEY,
  codigo VARCHAR(20)  NOT NULL UNIQUE,
  nombre VARCHAR(60)  NOT NULL
);

-- ============================================================
--  BLOQUE 1 · CATÁLOGOS
-- ============================================================

-- 1.1  Roles de usuario
CREATE TABLE roles (
  id          SMALLSERIAL  PRIMARY KEY,
  codigo      VARCHAR(30)  NOT NULL UNIQUE,
  descripcion VARCHAR(120) NOT NULL
);

-- 1.2  Etapas fenológicas
CREATE TABLE etapas_fenologicas (
  id       SMALLSERIAL  PRIMARY KEY,
  codigo   VARCHAR(40)  NOT NULL UNIQUE,
  nombre   VARCHAR(80)  NOT NULL,
  orden    SMALLINT     NOT NULL UNIQUE,
  color_bg VARCHAR(10)  NULL,
  color_fg VARCHAR(10)  NULL
);

-- 1.2b  Especies (catálogo extensible) — identidad para la fenología por especie
CREATE TABLE especies (
  id                SMALLSERIAL  PRIMARY KEY,
  nombre            VARCHAR(120) NOT NULL UNIQUE,
  nombre_cientifico VARCHAR(160) NULL,
  es_sistema        BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id     BIGINT       NULL,    -- FK diferida → usuarios
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 1.2c  Fenología estandarizada: duración (min/max días) de cada etapa por especie
CREATE TABLE especie_etapas (
  id         SMALLSERIAL PRIMARY KEY,
  especie_id SMALLINT    NOT NULL REFERENCES especies(id)            ON DELETE CASCADE,
  etapa_id   SMALLINT    NOT NULL REFERENCES etapas_fenologicas(id),
  min_dias   SMALLINT    NOT NULL CHECK (min_dias >= 0),
  max_dias   SMALLINT    NOT NULL CHECK (max_dias >= min_dias),
  UNIQUE (especie_id, etapa_id)
);

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

-- 1.5  Categorías y tipos de práctica agrícola
CREATE TABLE categorias_practica (
  id               SMALLSERIAL PRIMARY KEY,
  nombre           VARCHAR(40) NOT NULL UNIQUE,
  es_sostenible    BOOLEAN     NOT NULL DEFAULT TRUE,
  sin_agroquimicos BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE tipos_practica (
  id           SMALLSERIAL  PRIMARY KEY,
  categoria_id SMALLINT     NOT NULL REFERENCES categorias_practica(id),
  nombre       VARCHAR(120) NOT NULL UNIQUE
);

-- 1.6  Categorías de costo
CREATE TABLE categorias_costo (
  id     SMALLSERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

-- 1.7  Tipos de alerta
CREATE TABLE tipos_alerta (
  id     SMALLSERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

-- 1.8  Factores de huella de carbono
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

-- 1.9  Unidades de medida (catálogo extensible)
CREATE TABLE unidades (
  id            SMALLSERIAL  PRIMARY KEY,
  codigo        VARCHAR(20)  NOT NULL UNIQUE,
  nombre        VARCHAR(60)  NOT NULL,
  es_sistema    BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id BIGINT       NULL,    -- FK diferida → usuarios
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 1.10  Insumos (catálogo extensible)
CREATE TABLE insumos (
  id            SMALLSERIAL  PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  es_sistema    BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id BIGINT       NULL,    -- FK diferida → usuarios
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 1.11  Zonas de la planta (catálogo extensible) — para incidencias
CREATE TABLE zonas_planta (
  id            SMALLSERIAL  PRIMARY KEY,
  nombre        VARCHAR(80)  NOT NULL,
  es_sistema    BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id BIGINT       NULL,    -- FK diferida → usuarios
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 1.12  Tipos de área de sembrío (catálogo extensible) — escalabilidad
CREATE TABLE tipos_area (
  id            SMALLSERIAL  PRIMARY KEY,
  codigo        VARCHAR(40)  NOT NULL UNIQUE,
  nombre        VARCHAR(80)  NOT NULL,
  es_sistema    BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id BIGINT       NULL,    -- FK diferida → usuarios
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

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

-- FKs diferidas: "creado_por" de los catálogos extensibles
ALTER TABLE especies     ADD CONSTRAINT fk_especies_creador  FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE unidades     ADD CONSTRAINT fk_unidades_creador  FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE insumos      ADD CONSTRAINT fk_insumos_creador   FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE zonas_planta ADD CONSTRAINT fk_zonas_creador     FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE tipos_area   ADD CONSTRAINT fk_tipos_area_creador FOREIGN KEY (creado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;


-- 2.3  Biohuertos
CREATE TABLE biohuertos (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_area_id   SMALLINT      NOT NULL REFERENCES tipos_area(id),
  codigo         VARCHAR(20)   NOT NULL UNIQUE,
  abreviatura    VARCHAR(20)   NULL,
  nombre         VARCHAR(160)  NOT NULL,
  descripcion    TEXT          NULL,
  ubicacion_referencia_encrypted BYTEA NULL,
  latitud        NUMERIC(9,6)  NULL,
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

-- 2.4  Propietarios / administradores del biohuerto (N:M). PK UUID → offline.
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
--  BLOQUE 3 · ARCHIVOS ADJUNTOS
-- ============================================================
CREATE TABLE archivos_adjuntos (
  id             BIGSERIAL    PRIMARY KEY,
  biohuerto_id   UUID         NULL REFERENCES biohuertos(id) ON DELETE CASCADE,
  cultivo_id     UUID         NULL,   -- FK diferida → cultivos
  incidencia_id  UUID         NULL,   -- FK diferida → incidencias
  diagnostico_id UUID         NULL,   -- FK diferida → diagnosticos
  cosecha_id     UUID         NULL,   -- FK diferida → cosechas
  usuario_id     BIGINT       NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre         VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(80)  NOT NULL,
  tamano_bytes   INTEGER      NOT NULL CHECK (tamano_bytes > 0),
  datos          BYTEA        NOT NULL,
  es_principal   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (
    (biohuerto_id   IS NOT NULL)::INT +
    (cultivo_id     IS NOT NULL)::INT +
    (incidencia_id  IS NOT NULL)::INT +
    (diagnostico_id IS NOT NULL)::INT +
    (cosecha_id     IS NOT NULL)::INT +
    (usuario_id     IS NOT NULL)::INT = 1
  )
);

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

-- 4.2  FK diferida: archivos_adjuntos → cultivos
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

-- 4.4  Asignación de productores a cultivos (N:M). PK UUID → offline.
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

-- 5.2  Registros de monitoreo
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

-- FK diferida: archivos_adjuntos → incidencias
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

-- FK diferida: archivos_adjuntos → diagnosticos
ALTER TABLE archivos_adjuntos
  ADD CONSTRAINT fk_adj_diagnostico  FOREIGN KEY (diagnostico_id)
    REFERENCES diagnosticos(id) ON DELETE CASCADE;

-- 6.2  Alternativas del diagnóstico
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

-- 7.1  RAG (embeddings pgvector)
CREATE TABLE rag_chunks (
  id          BIGSERIAL    PRIMARY KEY,
  fuente      VARCHAR(200) NOT NULL,
  chunk_index INT          NOT NULL,
  contenido   TEXT         NOT NULL,
  embedding   VECTOR(1536) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============================================================
--  BLOQUE 8 · PRÁCTICAS AGRÍCOLAS
-- ============================================================
CREATE TABLE practicas_agricolas (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
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
CREATE TABLE costos_produccion (
  id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Columnas estructurales añadidas a alertas (incl. FK → cuidados)
ALTER TABLE alertas
  ADD COLUMN vista BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN cuidado_id UUID NULL REFERENCES cuidados(id) ON DELETE CASCADE;

-- ============================================================
--  BLOQUE 11 · COSECHAS Y OFERTAS
-- ============================================================
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

-- FK diferida: archivos_adjuntos → cosechas
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

-- 12.1  Componentes del cálculo de huella (entrada+factor+resultado por componente)
CREATE TABLE huella_componentes (
  id               BIGSERIAL     PRIMARY KEY,
  huella_id        BIGINT        NOT NULL REFERENCES huella_carbono(id) ON DELETE CASCADE,
  tipo             VARCHAR(20)   NOT NULL
                   CHECK (tipo IN ('agua','compost','abono_verde','sin_agroquim','ctrl_bio')),
  cantidad         NUMERIC(10,3) NOT NULL DEFAULT 0,
  factor_id        SMALLINT      NOT NULL REFERENCES factores_carbono(id),
  resultado_kg_co2 NUMERIC(10,4) NOT NULL DEFAULT 0,
  UNIQUE (huella_id, tipo)
);

-- ============================================================
--  BLOQUE 13 · SINCRONIZACIÓN OFFLINE
--  Entidad sin FK: record_uuid es una referencia "soft" a la PK
--  UUID de la tabla indicada en `tabla`. Las tablas con PK UUID
--  (biohuertos, cultivos, monitoreo_registros, incidencias,
--  diagnosticos, cosechas, cuidados, practicas_agricolas,
--  costos_produccion, cultivo_asignaciones) llevan además
--  last_synced_at + is_synced.
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
  created_at_local TIMESTAMPTZ  NOT NULL,
  processed_at     TIMESTAMPTZ  NULL,
  last_synced_at   TIMESTAMPTZ  NULL,
  is_synced        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ  NULL
);

-- ============================================================
--  BLOQUE 14 · CONTROL DE ACCESO POR ROL (vistas y acciones)
--  rol_permisos(rol, vista, accion) = matriz de permisos.
--  "Ver" una vista = tener la acción 'ver_lista' sobre ella.
-- ============================================================
CREATE TABLE vistas (
  id          SMALLSERIAL  PRIMARY KEY,
  codigo      VARCHAR(80)  NOT NULL UNIQUE,
  nombre      VARCHAR(120) NOT NULL,
  modulo      VARCHAR(60)  NULL,
  descripcion VARCHAR(200) NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE acciones (
  id     SMALLSERIAL PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL UNIQUE,
  nombre VARCHAR(80) NOT NULL
);

-- Acciones aplicables a cada vista (el "menú" de lo asignable)
CREATE TABLE vista_acciones (
  id        SMALLSERIAL PRIMARY KEY,
  vista_id  SMALLINT    NOT NULL REFERENCES vistas(id)   ON DELETE CASCADE,
  accion_id SMALLINT    NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  UNIQUE (vista_id, accion_id)
);

-- Permiso = (rol, vista, accion). FK compuesta → solo acciones aplicables.
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
