-- 012_seed_demo.sql
-- Fecha: 2026-07-13
-- DATOS DEMO (no cambia esquema): llena las tablas vacías y completa los cultivos
-- a los que les falten hijos (monitoreo, prácticas, costos, cuidados, dedicaciones,
-- autoconsumos, ventas, huella de carbono) + asigna comunidad/modalidad a los
-- biohuertos. Generativo (INSERT ... SELECT sobre datos reales), con fechas
-- relativas a la siembra y montos realistas.
-- Idempotente: cada bloque usa NOT EXISTS / guardas, así que el runner de
-- migraciones lo puede re-aplicar en cada arranque sin duplicar.
-- Se aplica solo (junto al resto) con: python backend/db/apply_migrations.py

-- Pseudo-aleatorio determinista por fila: abs(hashtext(clave)) % rango

-- ============================================================
-- 1) PRÁCTICAS para cultivos que no tienen ninguna
--    (preparación de terreno + aplicación de compost, previas a la siembra)
-- ============================================================
INSERT INTO practicas_agricolas (cultivo_id, usuario_id, tipo_id, descripcion, insumo_id, cantidad, unidad_id, fecha_aplicacion)
SELECT c.id, c.usuario_id, x.tipo_id, x.descripcion, x.insumo_id, x.cantidad, x.unidad_id, c.fecha_siembra + x.dias
FROM cultivos c
CROSS JOIN LATERAL (VALUES
  ((select id from tipos_practica where nombre = 'Preparación de terreno'),
     'Removido y nivelado del terreno antes de la siembra',
     NULL::smallint, NULL::numeric, NULL::smallint, -5),
  ((select id from tipos_practica where nombre = 'Compost / Abono orgánico'),
     'Aplicación de compost incorporado al suelo',
     (select id from insumos where nombre ilike 'Compost%' limit 1),
     (6 + abs(hashtext(c.id::text || 'cmp')) % 10)::numeric,          -- 6..15 kg
     (select id from unidades where codigo = 'kg'), -2)
) AS x(tipo_id, descripcion, insumo_id, cantidad, unidad_id, dias)
WHERE c.deleted_at is null
  AND NOT EXISTS (select 1 from practicas_agricolas p where p.cultivo_id = c.id and p.deleted_at is null);

-- ============================================================
-- 2) MONITOREO para cultivos sin registros (3 lecturas post-siembra)
-- ============================================================
INSERT INTO monitoreo_registros (cultivo_id, fuente_id, usuario_id, humedad_pct, temperatura_c, luminosidad_lux, ph_suelo, observacion, registrado_en)
SELECT c.id,
       (select id from fuentes_monitoreo where codigo = 'manual'),
       c.usuario_id,
       (45 + abs(hashtext(c.id::text || g::text || 'h')) % 31)::numeric,          -- 45..75 %
       (16 + abs(hashtext(c.id::text || g::text || 't')) % 13)::numeric,          -- 16..28 °C
       (6000 + abs(hashtext(c.id::text || g::text || 'l')) % 16000)::numeric,     -- 6000..22000 lux
       round(5.8 + (abs(hashtext(c.id::text || g::text || 'p')) % 15) * 0.1, 2),  -- 5.8..7.2
       (array['Planta sana, buen desarrollo','Humedad adecuada','Se observa crecimiento normal','Sin signos de plaga'])[1 + abs(hashtext(c.id::text || g::text)) % 4],
       (c.fecha_siembra + (g * 7))::timestamptz + interval '9 hours'
FROM cultivos c
CROSS JOIN generate_series(1, 3) g
WHERE c.deleted_at is null
  AND NOT EXISTS (select 1 from monitoreo_registros m where m.cultivo_id = c.id and m.deleted_at is null);

-- ============================================================
-- 3) COSTOS para cultivos sin costos (semilla + insumos + agua)
-- ============================================================
INSERT INTO costos_produccion (cultivo_id, usuario_id, categoria_id, descripcion, cantidad, unidad_id, monto, moneda, fecha)
SELECT c.id, c.usuario_id, x.cat_id, x.descripcion, x.cantidad, x.unidad_id, x.monto, 'PEN', c.fecha_siembra + x.dias
FROM cultivos c
CROSS JOIN LATERAL (VALUES
  ((select id from categorias_costo where nombre = 'Semilla'),  'Compra de semilla',       1::numeric, (select id from unidades where codigo='saco'),  (5 + abs(hashtext(c.id::text||'s')) % 16)::numeric, -3),
  ((select id from categorias_costo where nombre = 'Insumos'),  'Insumos orgánicos',       1::numeric, (select id from unidades where codigo='und'),   (8 + abs(hashtext(c.id::text||'i')) % 23)::numeric,  0),
  ((select id from categorias_costo where nombre = 'Agua'),     'Riego del ciclo',         1::numeric, (select id from unidades where codigo='und'),   (3 + abs(hashtext(c.id::text||'a')) % 10)::numeric, 10)
) AS x(cat_id, descripcion, cantidad, unidad_id, monto, dias)
WHERE c.deleted_at is null
  AND NOT EXISTS (select 1 from costos_produccion co where co.cultivo_id = c.id and co.deleted_at is null);

-- ============================================================
-- 4) CUIDADOS para todos los cultivos activos (riego + control preventivo)
--    cuidados.tipo_id → tipos_alerta
-- ============================================================
INSERT INTO cuidados (cultivo_id, tipo_id, descripcion, frecuencia_dias, ultima_realizada, is_active)
SELECT c.id, x.tipo_id, x.descripcion, x.frecuencia, now() - (x.hace || ' days')::interval, true
FROM cultivos c
CROSS JOIN LATERAL (VALUES
  ((select id from tipos_alerta where nombre = 'Riego'),             'Riego por goteo en la mañana',        3::smallint, 1),
  ((select id from tipos_alerta where nombre = 'Control preventivo'),'Revisión de plagas y deshoje',        15::smallint, 6)
) AS x(tipo_id, descripcion, frecuencia, hace)
WHERE c.deleted_at is null and c.is_active
  AND NOT EXISTS (select 1 from cuidados cu where cu.cultivo_id = c.id and cu.deleted_at is null);

-- ============================================================
-- 5) DEDICACIONES (horas) por biohuerto — para cada propietario activo
-- ============================================================
INSERT INTO dedicaciones (biohuerto_id, usuario_id, actividad_id, fecha, horas, observacion)
SELECT bp.biohuerto_id, bp.propietario_id, x.actividad_id, CURRENT_DATE - x.hace, x.horas, x.obs
FROM biohuerto_propietarios bp
CROSS JOIN LATERAL (VALUES
  ((select id from actividades where codigo='limpieza'),   round(1 + (abs(hashtext(bp.id::text||'l')) % 20) * 0.1, 2), 5,  'Limpieza de la parcela'),
  ((select id from actividades where codigo='riego'),      round(0.5 + (abs(hashtext(bp.id::text||'r')) % 15) * 0.1, 2), 3, 'Riego del biohuerto'),
  ((select id from actividades where codigo='compostaje'), round(1 + (abs(hashtext(bp.id::text||'c')) % 15) * 0.1, 2), 12, 'Volteo del compost')
) AS x(actividad_id, horas, hace, obs)
WHERE bp.is_active = true and bp.deleted_at is null
  AND NOT EXISTS (select 1 from dedicaciones d where d.biohuerto_id = bp.biohuerto_id and d.usuario_id = bp.propietario_id and d.deleted_at is null);

-- ============================================================
-- 6) AUTOCONSUMOS por cosecha (15% de lo producido) + descuenta stock
-- ============================================================
WITH nuevos AS (
  INSERT INTO autoconsumos (cosecha_id, usuario_id, nombre_producto, cultivo, cantidad, unidad_id, fecha, notas)
  SELECT co.id, co.usuario_id, co.nombre_producto, e.nombre,
         round(co.cantidad * 0.15, 2), co.unidad_id, coalesce(co.fecha_cosecha, CURRENT_DATE) + 1, 'Autoconsumo familiar'
  FROM cosechas co
  JOIN cultivos cu on cu.id = co.cultivo_id
  JOIN especies e on e.id = cu.especie_id
  WHERE co.deleted_at is null and co.cultivo_id is not null
    AND round(co.cantidad * 0.15, 2) > 0
    AND NOT EXISTS (select 1 from autoconsumos a where a.cosecha_id = co.id and a.deleted_at is null)
  RETURNING cosecha_id, cantidad
)
UPDATE cosechas c SET cantidad = greatest(0, c.cantidad - n.cantidad)
FROM nuevos n WHERE c.id = n.cosecha_id;

-- ============================================================
-- 7) MINIMARKET ECOLÓGICO: una ronda de venta por productor con cosechas,
--    y ventas de sus cosechas (40% de lo disponible) + descuenta stock
-- ============================================================
INSERT INTO venta_rondas (usuario_id, nombre, fecha, hora_inicio, estado)
SELECT u.id, 'Minimarket Ecológico USAT', date_trunc('month', CURRENT_DATE)::date - 1, time '09:00', 'cerrada'
FROM usuarios u
WHERE u.deleted_at is null
  AND EXISTS (select 1 from cosechas co where co.usuario_id = u.id and co.deleted_at is null)
  AND NOT EXISTS (select 1 from venta_rondas vr where vr.usuario_id = u.id and vr.deleted_at is null);

WITH vendidas AS (
  INSERT INTO ventas (ronda_id, cosecha_id, usuario_id, nombre_producto, cultivo, precio_unitario, cantidad, unidad_id, fecha, hora)
  SELECT vr.id, co.id, co.usuario_id, co.nombre_producto, e.nombre,
         coalesce(nullif(co.precio_referencial, 0), 3.50),
         round(co.cantidad * 0.40, 2), co.unidad_id, vr.fecha, time '10:30'
  FROM cosechas co
  JOIN venta_rondas vr on vr.usuario_id = co.usuario_id and vr.deleted_at is null
  JOIN cultivos cu on cu.id = co.cultivo_id
  JOIN especies e on e.id = cu.especie_id
  WHERE co.deleted_at is null and co.cultivo_id is not null and co.cantidad > 0
    AND NOT EXISTS (select 1 from ventas v where v.cosecha_id = co.id and v.deleted_at is null)
  RETURNING cosecha_id, cantidad
)
UPDATE cosechas c SET cantidad = greatest(0, c.cantidad - v.cantidad),
       estado = case when greatest(0, c.cantidad - v.cantidad) <= 0 then 'agotado' else c.estado end
FROM vendidas v WHERE c.id = v.cosecha_id;

-- ============================================================
-- 8) Reconstruir cantidad_inicial (total producido) = stock + vendido + autoconsumido
--    (el seed traía cantidad_inicial = 0; así los reportes de producción cuadran)
-- ============================================================
UPDATE cosechas c
SET cantidad_inicial = c.cantidad
  + coalesce((select sum(v.cantidad) from ventas v where v.cosecha_id = c.id and v.deleted_at is null), 0)
  + coalesce((select sum(a.cantidad) from autoconsumos a where a.cosecha_id = c.id and a.deleted_at is null), 0)
WHERE c.deleted_at is null
  AND (c.cantidad_inicial IS NULL OR c.cantidad_inicial = 0);  -- solo repara el dato roto; no pisa valores reales

-- ============================================================
-- 10) Asignar modalidad y comunidad a los biohuertos (para que el reporte por
--     comunidad tenga datos). Round-robin determinista; ~1 de cada 3 comunitario.
-- ============================================================
UPDATE biohuertos b
SET comunidad_id = (
      select id from comunidades order by id
      offset (abs(hashtext(b.id::text)) % (select count(*) from comunidades)) limit 1
    )
WHERE b.deleted_at is null and b.comunidad_id is null;

UPDATE biohuertos b
SET modalidad_id = (select id from modalidades where codigo = 'comunitario')
WHERE b.deleted_at is null
  AND abs(hashtext(b.id::text || 'mod')) % 3 = 0
  AND b.modalidad_id = (select id from modalidades where codigo = 'casero');

-- ============================================================
-- 9) HUELLA DE CARBONO para cultivos activos que no la tienen
--    (5 componentes; neta = agua - compost - abono_verde - sin_agroquim - ctrl_bio)
--    Cantidades tomadas de las prácticas y el área reales del cultivo.
-- ============================================================
WITH faltantes AS (
  SELECT c.id AS cultivo_id, c.usuario_id,
         coalesce(c.fecha_siembra, CURRENT_DATE - 90) AS p_ini,
         coalesce(c.fecha_estimada_cosecha, c.fecha_siembra + 90, CURRENT_DATE) AS p_fin,
         coalesce(c.area_m2, 10)::numeric AS area,
         round(coalesce(c.area_m2, 10) * (0.35 + (abs(hashtext(c.id::text || 'w')) % 25) * 0.01), 2) AS agua,
         coalesce((select sum(pa.cantidad) from practicas_agricolas pa join insumos i on i.id = pa.insumo_id
                   where pa.cultivo_id = c.id and pa.deleted_at is null and i.nombre ilike '%compost%'), 0)::numeric AS compost,
         coalesce((select sum(pa.cantidad) from practicas_agricolas pa join insumos i on i.id = pa.insumo_id
                   where pa.cultivo_id = c.id and pa.deleted_at is null and i.nombre ilike '%abono verde%'), 0)::numeric AS abono_verde,
         coalesce((select count(*) from practicas_agricolas pa join tipos_practica tp on tp.id = pa.tipo_id
                   join categorias_practica cp on cp.id = tp.categoria_id
                   where pa.cultivo_id = c.id and pa.deleted_at is null and cp.nombre = 'Biológica'), 0)::numeric AS ctrl_bio
  FROM cultivos c
  WHERE c.deleted_at is null and c.is_active
    AND NOT EXISTS (select 1 from huella_carbono h where h.cultivo_id = c.id)
),
calc AS (
  SELECT *,
    round(agua * 0.344, 4) AS r_agua,
    round(compost * 0.150, 4) AS r_compost,
    round(abono_verde * 0.100, 4) AS r_abono,
    round(area * 0.500, 4) AS r_sinq,
    round(ctrl_bio * 0.300, 4) AS r_ctrl
  FROM faltantes
),
ins AS (
  INSERT INTO huella_carbono (cultivo_id, usuario_id, periodo_inicio, periodo_fin, huella_neta_kg_co2, semaforo_ambiental)
  SELECT cultivo_id, usuario_id, p_ini, p_fin,
         round(r_agua - (r_compost + r_abono + r_sinq + r_ctrl), 4),
         case when r_agua - (r_compost + r_abono + r_sinq + r_ctrl) <= 0 then 'verde'
              when r_agua - (r_compost + r_abono + r_sinq + r_ctrl) <= 8 then 'amarillo'
              else 'rojo' end
  FROM calc
  RETURNING id, cultivo_id
)
INSERT INTO huella_componentes (huella_id, tipo, cantidad, factor_id, resultado_kg_co2)
SELECT ins.id, x.tipo, x.cantidad, x.factor_id, x.resultado
FROM ins
JOIN calc ON calc.cultivo_id = ins.cultivo_id
CROSS JOIN LATERAL (VALUES
  ('agua',         calc.agua,        (select id from factores_carbono where codigo='AGUA_RIEGO'),   calc.r_agua),
  ('compost',      calc.compost,     (select id from factores_carbono where codigo='COMPOST_RED'),  calc.r_compost),
  ('abono_verde',  calc.abono_verde, (select id from factores_carbono where codigo='ABONO_VERDE'),  calc.r_abono),
  ('sin_agroquim', calc.area,        (select id from factores_carbono where codigo='SIN_AGROQUIM'), calc.r_sinq),
  ('ctrl_bio',     calc.ctrl_bio,    (select id from factores_carbono where codigo='CTRL_BIO'),     calc.r_ctrl)
) AS x(tipo, cantidad, factor_id, resultado);
