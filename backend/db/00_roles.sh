#!/usr/bin/env sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${MIGRATION_DB_PASSWORD:?MIGRATION_DB_PASSWORD is required}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"

psql \
  -v ON_ERROR_STOP=1 \
  -v database_name="$POSTGRES_DB" \
  -v migration_password="$MIGRATION_DB_PASSWORD" \
  -v app_password="$APP_DB_PASSWORD" \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" <<-'EOSQL'
CREATE ROLE migration_user LOGIN PASSWORD :'migration_password';
CREATE ROLE app_user LOGIN PASSWORD :'app_password';

ALTER DATABASE :"database_name" OWNER TO migration_user;
ALTER SCHEMA public OWNER TO migration_user;
GRANT CONNECT, TEMPORARY ON DATABASE :"database_name" TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT CREATE ON SCHEMA public TO migration_user;
EOSQL
