#!/usr/bin/env sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${MIGRATION_DB_PASSWORD:?MIGRATION_DB_PASSWORD is required}"

until PGPASSWORD="$MIGRATION_DB_PASSWORD" pg_isready -h db -U migration_user -d "$POSTGRES_DB"; do
  sleep 2
done

for file in /migrations/*.sql; do
  [ -f "$file" ] || continue
  echo "Applying $(basename "$file")"
  PGPASSWORD="$MIGRATION_DB_PASSWORD" psql \
    -v ON_ERROR_STOP=1 -h db -U migration_user -d "$POSTGRES_DB" -f "$file"
done
