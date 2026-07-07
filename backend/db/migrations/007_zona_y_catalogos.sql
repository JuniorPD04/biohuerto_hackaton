-- 007_zona_y_catalogos.sql
-- Fecha: 2026-07-06
-- Agrega zona geográfica al productor (para reportes por zona, ej. "Zona
-- P.J.") y dos entradas de catálogo pedidas explícitamente en el registro
-- de producción: "Preparación de terreno" (tipo de práctica) y "Residuos
-- sólidos orgánicos (RRSSOO)" (insumo).
-- Idempotente: se puede ejecutar varias veces sin error.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS zona VARCHAR(80);
CREATE INDEX IF NOT EXISTS idx_usuarios_zona ON usuarios(zona) WHERE zona IS NOT NULL;

INSERT INTO tipos_practica (categoria_id, nombre)
SELECT (SELECT id FROM categorias_practica WHERE nombre = 'Cultural'), 'Preparación de terreno'
WHERE NOT EXISTS (SELECT 1 FROM tipos_practica WHERE nombre = 'Preparación de terreno');

INSERT INTO insumos (nombre, es_sistema)
SELECT 'Residuos sólidos orgánicos (RRSSOO)', TRUE
WHERE NOT EXISTS (SELECT 1 FROM insumos WHERE nombre = 'Residuos sólidos orgánicos (RRSSOO)');
