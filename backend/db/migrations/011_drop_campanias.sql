-- 011_drop_campanias.sql
-- Fecha: 2026-07-13
-- La campaña deja de ser una entidad propia: es un CALENDARIO (timeline)
-- DERIVADO por cultivo, a partir de lo ya registrado (prácticas de preparación
-- de terreno y compost + fecha de siembra del cultivo + fecha de cosecha).
-- Por eso se elimina cultivos.campania_id y la tabla campanias.
-- Idempotente: DROP ... IF EXISTS. Primero la columna (quita la FK), luego la tabla.

ALTER TABLE cultivos DROP COLUMN IF EXISTS campania_id;
DROP TABLE IF EXISTS campanias;
