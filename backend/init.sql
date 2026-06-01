CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

GRANT USAGE ON SCHEMA public TO migration_user;
GRANT CREATE ON SCHEMA public TO migration_user;
GRANT USAGE ON SCHEMA public TO app_bio_user;

SET ROLE migration_user;

CREATE TYPE rol_usuario AS ENUM ('productor', 'consumidor', 'admin');
CREATE TYPE estado_alerta AS ENUM ('pendiente', 'completada', 'descartada');
CREATE TYPE etapa_cultivo AS ENUM ('semillero', 'crecimiento', 'floracion', 'fructificacion', 'cosecha', 'finalizado');

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'productor',
  telefono_encrypted BYTEA NULL,
  direccion_encrypted BYTEA NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE users IS 'Usuarios del ecosistema: productores, consumidores y administradores.';
COMMENT ON COLUMN users.telefono_encrypted IS 'ENCRYPTED: telefono cifrado a nivel aplicacion.';
COMMENT ON COLUMN users.direccion_encrypted IS 'ENCRYPTED: direccion cifrada a nivel aplicacion.';

CREATE TABLE biohuertos (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  nombre VARCHAR(160) NOT NULL,
  codigo VARCHAR(60) NOT NULL UNIQUE,
  ubicacion_referencia_encrypted BYTEA NULL,
  area_m2 NUMERIC(10,2) NOT NULL CHECK (area_m2 > 0),
  descripcion TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE biohuertos IS 'Fichas base de biohuertos urbanos comunitarios.';
COMMENT ON COLUMN biohuertos.ubicacion_referencia_encrypted IS 'ENCRYPTED: ubicacion de referencia cifrada.';

CREATE TABLE cultivos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  biohuerto_id BIGINT NULL REFERENCES biohuertos(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  especie VARCHAR(120) NOT NULL,
  variedad VARCHAR(120) NULL,
  etapa etapa_cultivo NOT NULL DEFAULT 'semillero',
  fecha_siembra DATE NOT NULL,
  fecha_estimada_cosecha DATE NULL,
  cantidad NUMERIC(10,2) NULL CHECK (cantidad IS NULL OR cantidad >= 0),
  area_m2 NUMERIC(10,2) NULL CHECK (area_m2 IS NULL OR area_m2 >= 0),
  campania VARCHAR(120) NULL,
  notas TEXT NULL,
  last_synced_at TIMESTAMPTZ NULL,
  is_synced BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE cultivos IS 'Registro digital de cultivos y ciclos productivos.';

CREATE TABLE monitoreo_registros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  biohuerto_id BIGINT NULL REFERENCES biohuertos(id) ON DELETE SET NULL,
  cultivo_id UUID NULL REFERENCES cultivos(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  humedad_porcentaje NUMERIC(5,2) NULL CHECK (humedad_porcentaje IS NULL OR humedad_porcentaje BETWEEN 0 AND 100),
  temperatura_c NUMERIC(5,2) NULL CHECK (temperatura_c IS NULL OR temperatura_c BETWEEN -10 AND 60),
  luminosidad_lux NUMERIC(10,2) NULL CHECK (luminosidad_lux IS NULL OR luminosidad_lux >= 0),
  incidencia TEXT NULL,
  observacion TEXT NULL,
  registrado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ NULL,
  is_synced BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE monitoreo_registros IS 'Captura manual de humedad, temperatura, luminosidad e incidencias.';

CREATE TABLE incidencias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  biohuerto_id BIGINT NULL REFERENCES biohuertos(id) ON DELETE SET NULL,
  cultivo_id UUID NULL REFERENCES cultivos(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  tipo VARCHAR(80) NOT NULL,
  descripcion TEXT NOT NULL,
  severidad VARCHAR(20) NOT NULL DEFAULT 'media' CHECK (severidad IN ('baja', 'media', 'alta')),
  estado VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_revision', 'cerrada')),
  reportado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ NULL,
  is_synced BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE incidencias IS 'Incidencias del biohuerto aptas para captura offline inicial.';

CREATE TABLE alertas (
  id BIGSERIAL PRIMARY KEY,
  biohuerto_id BIGINT NULL REFERENCES biohuertos(id) ON DELETE SET NULL,
  cultivo_id UUID NULL REFERENCES cultivos(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  titulo VARCHAR(160) NOT NULL,
  descripcion TEXT NULL,
  tipo VARCHAR(80) NOT NULL,
  prioridad SMALLINT NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 1 AND 3),
  estado estado_alerta NOT NULL DEFAULT 'pendiente',
  fecha_programada TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE alertas IS 'Recordatorios de riego, fertilizacion, control preventivo y cosecha.';

CREATE TABLE diagnosticos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  biohuerto_id BIGINT NULL REFERENCES biohuertos(id) ON DELETE SET NULL,
  cultivo_id UUID NULL REFERENCES cultivos(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  modalidad VARCHAR(20) NOT NULL CHECK (modalidad IN ('guiado', 'imagen')),
  especie VARCHAR(120) NOT NULL,
  sintomas JSONB NOT NULL DEFAULT '[]'::jsonb,
  zona_afectada VARCHAR(120) NULL,
  tiempo_dias INTEGER NULL CHECK (tiempo_dias IS NULL OR tiempo_dias >= 0),
  resultado_nombre VARCHAR(180) NULL,
  nivel_riesgo VARCHAR(20) NULL CHECK (nivel_riesgo IS NULL OR nivel_riesgo IN ('bajo', 'medio', 'alto')),
  recomendacion_resumen TEXT NULL,
  modelo_usado VARCHAR(120) NULL,
  last_synced_at TIMESTAMPTZ NULL,
  is_synced BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE diagnosticos IS 'Resultados de diagnostico fitosanitario guiado o por imagen opcional.';

CREATE TABLE recomendaciones (
  id BIGSERIAL PRIMARY KEY,
  diagnostico_id UUID NULL REFERENCES diagnosticos(id) ON DELETE SET NULL,
  cultivo_id UUID NULL REFERENCES cultivos(id) ON DELETE SET NULL,
  titulo VARCHAR(180) NOT NULL,
  cuerpo TEXT NOT NULL,
  categoria VARCHAR(80) NOT NULL DEFAULT 'agroecologica',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE recomendaciones IS 'Recomendaciones agroecologicas contextualizadas.';

CREATE TABLE cosechas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  biohuerto_id BIGINT NULL REFERENCES biohuertos(id) ON DELETE SET NULL,
  cultivo_id UUID NULL REFERENCES cultivos(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  nombre_producto VARCHAR(140) NOT NULL,
  cantidad NUMERIC(10,2) NOT NULL CHECK (cantidad >= 0),
  unidad VARCHAR(30) NOT NULL DEFAULT 'kg',
  precio_referencial NUMERIC(10,2) NOT NULL CHECK (precio_referencial >= 0),
  fecha_cosecha DATE NOT NULL,
  foto_url TEXT NULL,
  contacto_publico VARCHAR(160) NULL,
  telefono_contacto_encrypted BYTEA NULL,
  disponible BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ NULL,
  is_synced BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE cosechas IS 'Catalogo de cosechas disponible para consumidores.';
COMMENT ON COLUMN cosechas.telefono_contacto_encrypted IS 'ENCRYPTED: telefono de contacto cifrado si se almacena completo.';

CREATE TABLE trazabilidad_practicas (
  id BIGSERIAL PRIMARY KEY,
  biohuerto_id BIGINT NULL REFERENCES biohuertos(id) ON DELETE SET NULL,
  cultivo_id UUID NULL REFERENCES cultivos(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  tipo_practica VARCHAR(120) NOT NULL,
  descripcion TEXT NOT NULL,
  insumo VARCHAR(120) NULL,
  cantidad NUMERIC(10,2) NULL CHECK (cantidad IS NULL OR cantidad >= 0),
  unidad VARCHAR(30) NULL,
  fecha_aplicacion DATE NOT NULL,
  es_sostenible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE trazabilidad_practicas IS 'Practicas sostenibles aplicadas al cultivo.';

CREATE TABLE costeo_registros (
  id BIGSERIAL PRIMARY KEY,
  biohuerto_id BIGINT NULL REFERENCES biohuertos(id) ON DELETE SET NULL,
  cultivo_id UUID NULL REFERENCES cultivos(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  categoria VARCHAR(80) NOT NULL,
  descripcion TEXT NOT NULL,
  monto NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
  moneda CHAR(3) NOT NULL DEFAULT 'PEN',
  fecha DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE costeo_registros IS 'Costeo basico de insumos, agua y mano de obra.';

CREATE TABLE carbon_footprint_log (
  id BIGSERIAL PRIMARY KEY,
  biohuerto_id BIGINT NULL REFERENCES biohuertos(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  compost_kg NUMERIC(10,2) NOT NULL DEFAULT 0,
  area_m2 NUMERIC(10,2) NOT NULL DEFAULT 0,
  km_distribucion_evitable NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_kg_co2eq NUMERIC(10,2) NOT NULL DEFAULT 0,
  desglose JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE carbon_footprint_log IS 'Historico de calculos de impacto ambiental positivo.';

CREATE TABLE sync_queue (
  id BIGSERIAL PRIMARY KEY,
  tabla VARCHAR(80) NOT NULL,
  record_uuid UUID NOT NULL,
  operation VARCHAR(20) NOT NULL DEFAULT 'upsert' CHECK (operation IN ('upsert', 'update')),
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'conflict', 'error')),
  error_message TEXT NULL,
  created_at_local TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NULL,
  last_synced_at TIMESTAMPTZ NULL,
  is_synced BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE sync_queue IS 'Cola de sincronizacion diferida para registros offline.';

CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_biohuertos_user_id ON biohuertos(user_id);
CREATE INDEX idx_biohuertos_created_at ON biohuertos(created_at);
CREATE INDEX idx_cultivos_user_id ON cultivos(user_id);
CREATE INDEX idx_cultivos_biohuerto_id ON cultivos(biohuerto_id);
CREATE INDEX idx_cultivos_is_synced ON cultivos(is_synced);
CREATE INDEX idx_cultivos_created_at ON cultivos(created_at);
CREATE INDEX idx_monitoreo_user_id ON monitoreo_registros(user_id);
CREATE INDEX idx_monitoreo_biohuerto_id ON monitoreo_registros(biohuerto_id);
CREATE INDEX idx_monitoreo_cultivo_id ON monitoreo_registros(cultivo_id);
CREATE INDEX idx_monitoreo_is_synced ON monitoreo_registros(is_synced);
CREATE INDEX idx_monitoreo_created_at ON monitoreo_registros(created_at);
CREATE INDEX idx_incidencias_user_id ON incidencias(user_id);
CREATE INDEX idx_incidencias_biohuerto_id ON incidencias(biohuerto_id);
CREATE INDEX idx_incidencias_cultivo_id ON incidencias(cultivo_id);
CREATE INDEX idx_incidencias_is_synced ON incidencias(is_synced);
CREATE INDEX idx_incidencias_created_at ON incidencias(created_at);
CREATE INDEX idx_alertas_user_id ON alertas(user_id);
CREATE INDEX idx_alertas_biohuerto_id ON alertas(biohuerto_id);
CREATE INDEX idx_alertas_cultivo_id ON alertas(cultivo_id);
CREATE INDEX idx_alertas_estado_fecha ON alertas(estado, fecha_programada);
CREATE INDEX idx_alertas_created_at ON alertas(created_at);
CREATE INDEX idx_diagnosticos_user_id ON diagnosticos(user_id);
CREATE INDEX idx_diagnosticos_biohuerto_id ON diagnosticos(biohuerto_id);
CREATE INDEX idx_diagnosticos_cultivo_id ON diagnosticos(cultivo_id);
CREATE INDEX idx_diagnosticos_is_synced ON diagnosticos(is_synced);
CREATE INDEX idx_diagnosticos_created_at ON diagnosticos(created_at);
CREATE INDEX idx_recomendaciones_cultivo_id ON recomendaciones(cultivo_id);
CREATE INDEX idx_recomendaciones_created_at ON recomendaciones(created_at);
CREATE INDEX idx_cosechas_user_id ON cosechas(user_id);
CREATE INDEX idx_cosechas_biohuerto_id ON cosechas(biohuerto_id);
CREATE INDEX idx_cosechas_cultivo_id ON cosechas(cultivo_id);
CREATE INDEX idx_cosechas_is_synced ON cosechas(is_synced);
CREATE INDEX idx_cosechas_disponible ON cosechas(disponible);
CREATE INDEX idx_cosechas_created_at ON cosechas(created_at);
CREATE INDEX idx_trazabilidad_user_id ON trazabilidad_practicas(user_id);
CREATE INDEX idx_trazabilidad_biohuerto_id ON trazabilidad_practicas(biohuerto_id);
CREATE INDEX idx_trazabilidad_cultivo_id ON trazabilidad_practicas(cultivo_id);
CREATE INDEX idx_trazabilidad_created_at ON trazabilidad_practicas(created_at);
CREATE INDEX idx_costeo_user_id ON costeo_registros(user_id);
CREATE INDEX idx_costeo_biohuerto_id ON costeo_registros(biohuerto_id);
CREATE INDEX idx_costeo_cultivo_id ON costeo_registros(cultivo_id);
CREATE INDEX idx_costeo_created_at ON costeo_registros(created_at);
CREATE INDEX idx_carbon_user_id ON carbon_footprint_log(user_id);
CREATE INDEX idx_carbon_biohuerto_id ON carbon_footprint_log(biohuerto_id);
CREATE INDEX idx_carbon_created_at ON carbon_footprint_log(created_at);
CREATE INDEX idx_sync_queue_record_uuid ON sync_queue(record_uuid);
CREATE INDEX idx_sync_queue_is_synced ON sync_queue(is_synced);
CREATE INDEX idx_sync_queue_created_at ON sync_queue(created_at);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_biohuertos_updated_at BEFORE UPDATE ON biohuertos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cultivos_updated_at BEFORE UPDATE ON cultivos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_monitoreo_updated_at BEFORE UPDATE ON monitoreo_registros FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_incidencias_updated_at BEFORE UPDATE ON incidencias FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_alertas_updated_at BEFORE UPDATE ON alertas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_diagnosticos_updated_at BEFORE UPDATE ON diagnosticos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recomendaciones_updated_at BEFORE UPDATE ON recomendaciones FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cosechas_updated_at BEFORE UPDATE ON cosechas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_trazabilidad_updated_at BEFORE UPDATE ON trazabilidad_practicas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_costeo_updated_at BEFORE UPDATE ON costeo_registros FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_carbon_updated_at BEFORE UPDATE ON carbon_footprint_log FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_queue_updated_at BEFORE UPDATE ON sync_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_bio_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_bio_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO app_bio_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_bio_user;

RESET ROLE;
