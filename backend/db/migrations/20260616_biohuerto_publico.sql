-- Agrega acceso público/privado a biohuertos.
-- Privado (default): solo productores asignados manualmente pueden ver/sembrar.
-- Público: todos los productores activos pueden ver y sembrar.

ALTER TABLE biohuertos
  ADD COLUMN IF NOT EXISTS es_publico BOOLEAN NOT NULL DEFAULT false;
