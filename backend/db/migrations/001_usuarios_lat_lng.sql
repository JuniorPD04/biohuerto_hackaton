-- 001_usuarios_lat_lng.sql
-- Fecha: 2026-06-16
-- Agrega ubicación GPS (latitud/longitud) a la tabla usuarios, para poder
-- guardar la posición elegida en el mapa al registrar un usuario.
-- Las coordenadas van en claro (NUMERIC), igual que en biohuertos.
--
-- Idempotente: se puede ejecutar varias veces sin error.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS latitud  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitud NUMERIC(9,6);
