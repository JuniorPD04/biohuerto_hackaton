-- 010_comunidades.sql
-- Fecha: 2026-07-13
-- La comunidad (P.J.) es un atributo de UBICACIÓN del biohuerto, no del
-- usuario: una comunidad agrupa varios biohuertos (1 comunitario + varios
-- caseros). El reporte por comunidad se agrupa por biohuertos.comunidad_id.
-- Catálogo extensible ("Agregar nuevo"). Semilla con los P.J. del proyecto.
-- Idempotente: se puede ejecutar varias veces sin error.

CREATE TABLE IF NOT EXISTS comunidades (
  id            SMALLSERIAL  PRIMARY KEY,
  codigo        VARCHAR(40)  NOT NULL UNIQUE,
  nombre        VARCHAR(120) NOT NULL,
  es_sistema    BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por_id BIGINT       NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO comunidades (codigo, nombre, es_sistema) VALUES
  ('luis_alberto_sanchez', 'P.J. Luis Alberto Sánchez',      TRUE),
  ('san_cristian',         'P.J. San Cristian',              TRUE),
  ('santo_toribio',        'P.J. Santo Toribio de Mogrovejo', TRUE),
  ('santa_trinidad',       'P.J. Santa Trinidad',            TRUE),
  ('virgen_fatima',        'P.J. Virgen de Fátima',          TRUE),
  ('ejercito_salvacion',   'Ejército de Salvación',          TRUE)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE biohuertos
  ADD COLUMN IF NOT EXISTS comunidad_id SMALLINT REFERENCES comunidades(id);

CREATE INDEX IF NOT EXISTS idx_biohuertos_comunidad ON biohuertos(comunidad_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON comunidades TO app_bio_user;
