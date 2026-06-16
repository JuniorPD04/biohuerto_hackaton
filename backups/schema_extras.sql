-- ============================================================
--  schema_extras.sql — Todo lo NO estructural de init.sql
--  (NO necesario para el DER). Contiene:
--    · Extensiones
--    · Roles y privilegios (DCL): migration_user / app_bio_user
--    · Función y triggers updated_at
--    · INSERT de catálogos (seeds)
--    · Índices
--    · COMMENT
--
--  Orden de ejecución real:
--    1) extensiones + roles + grants (este archivo, parte superior)
--    2) SET ROLE migration_user
--    3) schema_ddl.sql  (tablas, tipos, FKs)
--    4) seeds + índices + triggers (parte inferior de este archivo)
--    5) privilegios app + RESET ROLE
--
--  → init.sql sigue siendo el script ejecutable completo.
-- ============================================================

-- ------------------------------------------------------------
--  Extensiones (requieren superusuario → antes de SET ROLE)
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
--  Roles y privilegios de esquema (DCL)
-- ------------------------------------------------------------
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

-- SET ROLE migration_user;   -- (en init.sql aquí arranca el DDL)

-- ------------------------------------------------------------
--  Función updated_at (usada por los triggers de abajo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
--  SEEDS / CATÁLOGOS (DML) — ejecutar DESPUÉS de schema_ddl.sql
-- ============================================================

INSERT INTO roles(codigo, descripcion) VALUES
  ('admin',     'Administrador del sistema'),
  ('productor', 'Productor de biohuerto'),
  ('consumidor','Consumidor / comprador');

INSERT INTO etapas_fenologicas(codigo, nombre, orden, color_bg, color_fg) VALUES
  ('semillero',      'Semillero',      1, '#e7e9e6', '#5a625a'),
  ('crecimiento',    'Crecimiento',    2, '#dcefd7', '#2f6b34'),
  ('floracion',      'Floración',      3, '#fbf0c9', '#8a6b16'),
  ('fructificacion', 'Fructificación', 4, '#fbe2cd', '#9a5a23'),
  ('cosecha',        'Cosecha',        5, '#cfe8cd', '#1f5a2d'),
  ('finalizado',     'Finalizado',     6, '#dadcd8', '#4a4f49');

INSERT INTO especies(codigo, nombre, nombre_cientifico, es_sistema) VALUES
  ('lechuga',      'Lechuga',       'Lactuca sativa',        TRUE),
  ('tomate',       'Tomate',        'Solanum lycopersicum',  TRUE),
  ('fresa',        'Fresa',         'Fragaria × ananassa',   TRUE),
  ('culantro',     'Culantro',      'Coriandrum sativum',    TRUE),
  ('espinaca',     'Espinaca',      'Spinacia oleracea',     TRUE),
  ('rabanito',     'Rabanito',      'Raphanus sativus',      TRUE),
  ('zanahoria',    'Zanahoria',     'Daucus carota',         TRUE),
  ('cebolla_china','Cebolla china', 'Allium fistulosum',     TRUE),
  ('aji',          'Ají',           'Capsicum baccatum',     TRUE),
  ('otro',         'Otro',          NULL,                    TRUE);

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

INSERT INTO insumos(codigo, nombre, es_sistema) VALUES
  ('compost',        'Compost',          TRUE),
  ('humus',          'Humus de lombriz', TRUE),
  ('biol',           'Biol',             TRUE),
  ('ceniza',         'Ceniza',           TRUE),
  ('jabon_potasico', 'Jabón potásico',   TRUE),
  ('caldo_bordeles', 'Caldo bordelés',   TRUE),
  ('cal_agricola',   'Cal agrícola',     TRUE),
  ('estiercol',      'Estiércol',        TRUE),
  ('abono_verde',    'Abono verde',      TRUE),
  ('agua',           'Agua',             TRUE);

INSERT INTO zonas_planta(codigo, nombre, es_sistema) VALUES
  ('hoja',            'Hoja',            TRUE),
  ('tallo',           'Tallo',           TRUE),
  ('raiz',            'Raíz',            TRUE),
  ('fruto',           'Fruto',           TRUE),
  ('flor',            'Flor',            TRUE),
  ('planta_completa', 'Planta completa', TRUE),
  ('otro',            'Otro',            TRUE);

INSERT INTO tipos_area(codigo, nombre, es_sistema) VALUES
  ('biohuerto',       'Biohuerto',       TRUE),
  ('parcela',         'Parcela',         TRUE),
  ('huerto_familiar', 'Huerto familiar', TRUE),
  ('invernadero',     'Invernadero',     TRUE),
  ('hectarea',        'Hectárea',        TRUE),
  ('otro',            'Otro',            TRUE);

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

INSERT INTO tipos_incidencia(nombre) VALUES
  ('Plaga'),('Enfermedad'),('Clima adverso'),
  ('Daño físico'),('Deficiencia nutricional'),('Otro');

INSERT INTO categorias_practica(nombre, es_sostenible, sin_agroquimicos) VALUES
  ('Orgánica',  TRUE,  TRUE),
  ('Biológica', TRUE,  TRUE),
  ('Cultural',  TRUE,  FALSE);

INSERT INTO tipos_practica(categoria_id, nombre) VALUES
  (1,'Compost / Abono orgánico'),(1,'Abono verde'),(1,'Sin agroquímicos'),
  (2,'Control biológico'),(2,'Trampas para plagas'),
  (3,'Riego eficiente'),(3,'Poda sanitaria'),
  (3,'Rotación de cultivos'),(3,'Policultivo / Cultivos asociados'),(3,'Otro');

INSERT INTO categorias_costo(nombre) VALUES
  ('Insumos'),('Agua'),('Mano de obra'),('Herramientas'),('Otros');

INSERT INTO tipos_alerta(nombre) VALUES
  ('Riego'),('Fertilización'),('Control preventivo'),
  ('Cosecha'),('Rotación de cultivos'),('Otro');

INSERT INTO factores_carbono(codigo, descripcion, valor, unidad, fuente) VALUES
  ('AGUA_RIEGO',   'Emisión por m³ de agua de riego',            0.344000,'kg CO₂/m³', 'IPCC Guidelines 2006'),
  ('COMPOST_RED',  'Reducción por kg de compost aplicado',        0.150000,'kg CO₂/kg', 'Lal, R. (2004)'),
  ('ABONO_VERDE',  'Reducción por kg de abono verde incorporado', 0.100000,'kg CO₂/kg', 'Lal, R. (2004)'),
  ('SIN_AGROQUIM', 'Reducción por m² sin agroquímicos',           0.500000,'kg CO₂/m²', 'FAO Agroecology 2018'),
  ('CTRL_BIO',     'Reducción por aplicación de control biológico',0.300000,'kg CO₂/ap','SENASA BPA Perú');

-- ============================================================
--  COMMENT (documentación de columnas/tablas)
-- ============================================================
COMMENT ON TABLE archivos_adjuntos IS
  'Imágenes en BYTEA. FKs directas por entidad para garantizar integridad referencial.
   Las FKs a UUID (cultivo, incidencia, diagnostico, cosecha) se agregan con ALTER TABLE
   después de crear las tablas destino.';
COMMENT ON COLUMN monitoreo_registros.luminosidad_lux IS
  'El nivel (Alta/Media/Baja) se deriva en la app con CASE WHEN. No se almacena (3FN).';
COMMENT ON COLUMN monitoreo_registros.sensor_codigo IS
  'NULL si fuente=manual. Identifica el sensor físico si fuente=iot.';
COMMENT ON COLUMN diagnosticos.cultivo_id IS
  'NULL si el diagnóstico se lanzó desde el módulo global sin asociar cultivo.';
COMMENT ON COLUMN alertas.prioridad IS '1=baja, 2=media, 3=alta';
COMMENT ON TABLE cosechas IS
  'Un productor puede publicar muchas cosechas.
   La foto del producto va en archivos_adjuntos con cosecha_id.';
COMMENT ON TABLE huella_carbono IS
  'Snapshot de cálculo de huella por cultivo y período.
   semaforo_ambiental se determina en app consultando:
   COUNT(incidencias WHERE severidad=alta AND estado!=cerrada),
   MAX(monitoreo_registros.registrado_en),
   COUNT(practicas JOIN categorias WHERE sin_agroquimicos=FALSE).';

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
CREATE INDEX idx_monitoreo_fuente     ON monitoreo_registros(fuente);
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
CREATE INDEX idx_adj_biohuerto        ON archivos_adjuntos(biohuerto_id)   WHERE biohuerto_id   IS NOT NULL;
CREATE INDEX idx_adj_cultivo          ON archivos_adjuntos(cultivo_id)     WHERE cultivo_id     IS NOT NULL;
CREATE INDEX idx_adj_incidencia       ON archivos_adjuntos(incidencia_id)  WHERE incidencia_id  IS NOT NULL;
CREATE INDEX idx_adj_diagnostico      ON archivos_adjuntos(diagnostico_id) WHERE diagnostico_id IS NOT NULL;
CREATE INDEX idx_adj_cosecha          ON archivos_adjuntos(cosecha_id)     WHERE cosecha_id     IS NOT NULL;
CREATE INDEX idx_adj_usuario          ON archivos_adjuntos(usuario_id)     WHERE usuario_id     IS NOT NULL;
CREATE INDEX idx_adj_principal        ON archivos_adjuntos(cultivo_id, es_principal) WHERE es_principal = TRUE;
CREATE INDEX idx_rag_chunks_embedding ON rag_chunks USING hnsw (embedding vector_cosine_ops);
CREATE UNIQUE INDEX uq_alertas_cuidado_pendiente
  ON alertas (cuidado_id)
  WHERE estado = 'pendiente' AND deleted_at IS NULL;
-- Índices de sincronización offline
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
CREATE INDEX idx_sync_queue_record    ON sync_queue(record_uuid);
CREATE INDEX idx_sync_queue_status    ON sync_queue(status)             WHERE status = 'pending';
CREATE INDEX idx_sync_queue_tabla     ON sync_queue(tabla);

-- ============================================================
--  TRIGGERS updated_at
-- ============================================================
CREATE TRIGGER trg_campanias_upd      BEFORE UPDATE ON campanias             FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_usuarios_upd       BEFORE UPDATE ON usuarios              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_consumidores_upd   BEFORE UPDATE ON consumidores_detalle  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
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

-- RESET ROLE;
