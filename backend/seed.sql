SET ROLE migration_user;

INSERT INTO users (id, email, password_hash, nombre, rol)
VALUES
  (1, 'admin@biohuerto.local', crypt('Demo123!', gen_salt('bf', 12)), 'Admin Demo', 'admin'),
  (2, 'productor.demo@biohuerto.local', crypt('Demo123!', gen_salt('bf', 12)), 'Rosa Campos', 'productor'),
  (3, 'consumidor.demo@biohuerto.local', crypt('Demo123!', gen_salt('bf', 12)), 'Luis Torres', 'consumidor')
ON CONFLICT (email) DO NOTHING;

SELECT setval('users_id_seq', greatest((SELECT max(id) FROM users), 1), true);

INSERT INTO biohuertos (id, user_id, nombre, codigo, area_m2, descripcion)
VALUES
  (1, 2, 'Biohuerto Comunitario Santa Victoria', 'BH-SV-001', 42.50, 'Biohuerto urbano demo para hortalizas de ciclo corto en Lambayeque.')
ON CONFLICT (codigo) DO NOTHING;

SELECT setval('biohuertos_id_seq', greatest((SELECT max(id) FROM biohuertos), 1), true);

INSERT INTO cultivos (
  id, biohuerto_id, user_id, especie, variedad, etapa, fecha_siembra,
  fecha_estimada_cosecha, cantidad, area_m2, campania, notas
)
VALUES
  ('11111111-1111-4111-8111-111111111111', 1, 2, 'Lechuga', 'Seda', 'crecimiento', '2026-05-10', '2026-06-25', 80, 12.00, 'Campania mayo 2026', 'Cultivo principal para venta local.'),
  ('22222222-2222-4222-8222-222222222222', 1, 2, 'Culantro', 'Criollo', 'semillero', '2026-05-22', '2026-06-18', 120, 8.00, 'Campania mayo 2026', 'Aromaticas para consumidores cercanos.'),
  ('33333333-3333-4333-8333-333333333333', 1, 2, 'Tomate', 'Cherry', 'floracion', '2026-04-18', '2026-07-05', 24, 10.00, 'Campania abril 2026', 'Requiere control preventivo semanal.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO monitoreo_registros (
  id, biohuerto_id, cultivo_id, user_id, humedad_porcentaje, temperatura_c,
  luminosidad_lux, incidencia, observacion, registrado_en
)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 1, '11111111-1111-4111-8111-111111111111', 2, 62.50, 24.30, 18400, NULL, 'Humedad adecuada despues de riego temprano.', '2026-05-29 07:20:00-05'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 1, '33333333-3333-4333-8333-333333333333', 2, 45.00, 27.80, 22100, 'Hojas con manchas pequenas', 'Revisar posible hongo por humedad nocturna.', '2026-05-30 08:10:00-05')
ON CONFLICT (id) DO NOTHING;

INSERT INTO incidencias (
  id, biohuerto_id, cultivo_id, user_id, tipo, descripcion, severidad, estado, reportado_en
)
VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 1, '33333333-3333-4333-8333-333333333333', 2, 'fitosanitaria', 'Manchas amarillas en hojas bajas de tomate cherry.', 'media', 'abierta', '2026-05-30 08:15:00-05')
ON CONFLICT (id) DO NOTHING;

INSERT INTO alertas (
  id, biohuerto_id, cultivo_id, user_id, titulo, descripcion, tipo, prioridad, estado, fecha_programada
)
VALUES
  (1, 1, '11111111-1111-4111-8111-111111111111', 2, 'Riego controlado de lechuga', 'Aplicar riego ligero al amanecer y revisar humedad.', 'riego', 2, 'pendiente', '2026-06-01 06:30:00-05'),
  (2, 1, '33333333-3333-4333-8333-333333333333', 2, 'Control preventivo de tomate', 'Aplicar biopreparado suave y retirar hojas afectadas.', 'control_preventivo', 1, 'pendiente', '2026-06-01 08:00:00-05'),
  (3, 1, '22222222-2222-4222-8222-222222222222', 2, 'Planificar cosecha de culantro', 'Revisar crecimiento para cosecha parcial.', 'cosecha', 3, 'pendiente', '2026-06-15 07:00:00-05')
ON CONFLICT (id) DO NOTHING;

SELECT setval('alertas_id_seq', greatest((SELECT max(id) FROM alertas), 1), true);

INSERT INTO diagnosticos (
  id, biohuerto_id, cultivo_id, user_id, modalidad, especie, sintomas,
  zona_afectada, tiempo_dias, resultado_nombre, nivel_riesgo, recomendacion_resumen
)
VALUES
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    1,
    '33333333-3333-4333-8333-333333333333',
    2,
    'guiado',
    'Tomate',
    '["manchas amarillas", "hojas bajas afectadas", "humedad nocturna"]'::jsonb,
    'hojas',
    3,
    'Posible inicio de problema fungico foliar',
    'medio',
    'Retirar hojas afectadas, mejorar ventilacion y aplicar cola de caballo o biol suave.'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO recomendaciones (diagnostico_id, cultivo_id, titulo, cuerpo, categoria)
VALUES
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    '33333333-3333-4333-8333-333333333333',
    'Manejo organico preventivo para tomate',
    'Retira hojas afectadas, evita mojar el follaje en la tarde y aplica extracto de cola de caballo en dosis baja cada 5 a 7 dias.',
    'agroecologica'
  );

INSERT INTO cosechas (
  id, biohuerto_id, cultivo_id, user_id, nombre_producto, cantidad, unidad,
  precio_referencial, fecha_cosecha, foto_url, contacto_publico
)
VALUES
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 1, '11111111-1111-4111-8111-111111111111', 2, 'Lechuga seda agroecologica', 18.00, 'unidades', 1.50, '2026-06-25', 'https://example.local/cosechas/lechuga.jpg', 'WhatsApp comunitario disponible en demo'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', 1, '22222222-2222-4222-8222-222222222222', 2, 'Culantro fresco', 6.50, 'kg', 8.00, '2026-06-18', 'https://example.local/cosechas/culantro.jpg', 'WhatsApp comunitario disponible en demo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO trazabilidad_practicas (
  biohuerto_id, cultivo_id, user_id, tipo_practica, descripcion, insumo,
  cantidad, unidad, fecha_aplicacion, es_sostenible
)
VALUES
  (1, '11111111-1111-4111-8111-111111111111', 2, 'compost', 'Aplicacion de compost maduro local en cama de lechuga.', 'Compost local', 12.00, 'kg', '2026-05-12', TRUE),
  (1, '33333333-3333-4333-8333-333333333333', 2, 'control biologico', 'Uso preventivo de biol diluido y retiro manual de hojas afectadas.', 'Biol casero', 2.00, 'litros', '2026-05-30', TRUE),
  (1, '22222222-2222-4222-8222-222222222222', 2, 'riego eficiente', 'Riego temprano con regadera de bajo caudal.', 'Agua', 18.00, 'litros', '2026-05-29', TRUE);

INSERT INTO costeo_registros (
  biohuerto_id, cultivo_id, user_id, categoria, descripcion, monto, moneda, fecha
)
VALUES
  (1, '11111111-1111-4111-8111-111111111111', 2, 'insumo', 'Compost local para cama de lechuga.', 18.00, 'PEN', '2026-05-12'),
  (1, '33333333-3333-4333-8333-333333333333', 2, 'mano_obra', 'Revision fitosanitaria y poda sanitaria.', 12.00, 'PEN', '2026-05-30'),
  (1, '22222222-2222-4222-8222-222222222222', 2, 'agua', 'Riego semanal estimado.', 4.50, 'PEN', '2026-05-29');

INSERT INTO carbon_footprint_log (
  biohuerto_id, user_id, periodo_inicio, periodo_fin, compost_kg,
  area_m2, km_distribucion_evitable, total_kg_co2eq, desglose
)
VALUES
  (
    1,
    2,
    '2026-05-01',
    '2026-05-31',
    12.00,
    42.50,
    15.00,
    21.90,
    '{"compost": 6.0, "captura_area": 12.75, "transporte": 3.15}'::jsonb
  );

RESET ROLE;

