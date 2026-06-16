#!/usr/bin/env sh
# Aplica todas las migraciones de backend/db/migrations en orden, contra la BD
# que corre en Docker (servicio "db"). Las migraciones deben ser idempotentes.
#
# Uso (desde cualquier carpeta del repo):
#   sh backend/db/apply-migrations.sh
set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"
MIG_DIR="$DIR/migrations"

if [ ! -d "$MIG_DIR" ]; then
  echo "No existe $MIG_DIR" >&2
  exit 1
fi

found=0
for f in "$MIG_DIR"/*.sql; do
  [ -e "$f" ] || continue
  found=1
  echo "→ aplicando $(basename "$f")"
  docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$f"
done

if [ "$found" -eq 0 ]; then
  echo "No hay migraciones en $MIG_DIR"
else
  echo "✓ migraciones aplicadas"
fi
