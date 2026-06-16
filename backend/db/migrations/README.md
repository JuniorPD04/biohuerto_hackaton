# Migraciones de base de datos

Scripts SQL para **actualizar una base de datos ya existente** sin resetearla.

`init.sql` y `seed.sql` solo se ejecutan cuando la BD se crea **desde cero**
(volumen vacío). Si ya tienes datos y haces un cambio de esquema, ese cambio
**no** llega a las BD existentes (la tuya, la de tus compañeros, la del demo).
Para eso están las migraciones: cada cambio de esquema se deja aquí como un
`.sql` numerado, y cada quien lo corre contra su BD.

## Regla de oro

> **Si cambias el esquema (init.sql), crea aquí la migración equivalente.**

1. Aplica el cambio en `backend/init.sql` (fuente de verdad para BD nuevas).
2. Crea aquí `NNN_descripcion.sql` con el cambio incremental para BD existentes.

## Convención

- Nombre: `NNN_descripcion.sql` con número correlativo de 3 dígitos
  (`001_`, `002_`, …). Se aplican en orden alfabético.
- **Idempotentes**: usa `IF NOT EXISTS` / `IF EXISTS` para poder re-ejecutar
  sin romper (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, etc.).
- Una migración = un cambio coherente. No edites una migración ya compartida;
  crea una nueva.

## Cómo aplicarlas

### Con Docker (recomendado, lo que usamos)

Todas las pendientes de una sola vez, desde la raíz del repo:

```bash
sh backend/db/apply-migrations.sh
```

O una migración puntual:

```bash
docker compose exec -T db sh -c \
  'PGPASSWORD="$MIGRATION_DB_PASSWORD" psql -v ON_ERROR_STOP=1 -U migration_user -d "$POSTGRES_DB"' \
  < backend/db/migrations/001_usuarios_lat_lng.sql
```

> Importante: córrelas como **`migration_user`** (no como superusuario). Así las
> tablas nuevas quedan con el dueño correcto y heredan permisos para `app_bio_user`.
> Si las corres como superusuario, la app falla con *"permission denied for table …"*.

### Sin Docker (psql directo)

Con tu cadena de conexión (la `DATABASE_URL` del `.env`, o `-h/-U/-d`):

```bash
psql "postgres://migration_user:PASS@localhost:5432/biohuerto" \
  -v ON_ERROR_STOP=1 -f backend/db/migrations/001_usuarios_lat_lng.sql
```

> Las DDL deben correr como **`migration_user`** (dueño del esquema) o el
> superusuario de Postgres.

## Migraciones

| #   | Archivo                       | Cambio                                            |
| --- | ----------------------------- | ------------------------------------------------- |
| 001 | `001_usuarios_lat_lng.sql`    | `usuarios`: agrega `latitud` y `longitud` (mapa). |
