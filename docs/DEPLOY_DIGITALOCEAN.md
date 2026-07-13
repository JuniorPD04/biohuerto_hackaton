# Despliegue en DigitalOcean (App Platform + Managed Database)

No hace falta un `asgi.py` ni `wsgi.py`: el backend ya es una app ASGI
(`backend/app/main.py:app`) y se ejecuta con Uvicorn, tal como en local. Lo
que faltaba era dejar todo listo para correr detrás del balanceador de App
Platform y contra una base de datos administrada (TLS obligatorio, sin los
scripts de `docker-entrypoint-initdb.d` que solo aplican a docker-compose).

Cambios ya aplicados en el repo:

- `backend/app/config.py` / `backend/app/database.py`: normalizan
  `DATABASE_URL` (acepta `postgres://` o `postgresql://`, como entrega DO) y
  activan TLS automáticamente (`DATABASE_SSL=true` o `ENVIRONMENT=production`).
- `backend/db/apply_migrations.py`: mismo soporte de TLS para el paso de
  migraciones.
- `backend/Dockerfile`: escucha en `$PORT` si el entorno lo define (si no,
  cae al 8000 de siempre), agrega `--proxy-headers` para el proxy de DO, y
  ahora incluye `backend/db` en la imagen para poder correr las migraciones
  como Job reusando el mismo Dockerfile.
- `.do/app.yaml`: plantilla de App Spec (backend + worker de notificaciones +
  job de migraciones + frontend como Static Site).

## 1. Crear la Managed Database

1. DigitalOcean → **Databases** → Create → PostgreSQL 18 (`.do/app.yaml` ya
   fija `version: "18"` para el cluster). Nota: tu docker-compose local sigue
   en `pgvector/pgvector:pg16`, o sea que local y producción quedan en
   versiones de Postgres distintas — pgvector soporta ambas, pero si algo
   falla solo en producción, revisa primero si es una diferencia de versión
   de motor antes que un bug de la migración en sí.
2. Anota host, puerto, nombre de la BD y el usuario admin (`doadmin`) que te
   entrega DO.
3. Habilita la extensión `vector` si tu plan lo pide explícitamente (Databases
   → tu cluster → Settings → Extensions); `uuid-ossp` y `pgcrypto` suelen venir
   habilitadas.

## 2. Bootstrap del esquema (una sola vez, a mano)

App Platform **no** ejecuta `00_roles.sh` / los SQL de
`backend/db/bootstrap/` automáticamente (eso solo pasa con el `docker-entrypoint-initdb.d`
de docker-compose, que solo corre en un contenedor nuevo). Hay que aplicarlos
una vez, manualmente, contra la Managed Database:

```bash
# Usa la connection string "admin" que te da el panel de DO (usuario doadmin)
psql "postgresql://doadmin:<password>@<host>:<port>/biohuerto?sslmode=require" \
  -f backend/db/bootstrap/01_init.sql
psql "postgresql://doadmin:<password>@<host>:<port>/biohuerto?sslmode=require" \
  -f backend/db/bootstrap/02_seed.sql
```

`01_init.sql` ya crea los roles `migration_user` y `app_bio_user` de forma
idempotente, pero con contraseñas de ejemplo (`change-me-*`). Cámbialas de
inmediato por unas fuertes y únicas:

```sql
ALTER ROLE migration_user WITH PASSWORD '<password-fuerte-1>';
ALTER ROLE app_bio_user WITH PASSWORD '<password-fuerte-2>';
```

Guarda esas dos contraseñas: son `MIGRATION_DB_PASSWORD` y `APP_DB_PASSWORD`
en el siguiente paso.

## 3. Completar `.do/app.yaml`

Edita `.do/app.yaml`:

- `<TU_USUARIO>/<TU_REPO>` → tu repo de GitHub (App Platform necesita acceso
  vía la GitHub App de DigitalOcean).
- `<NOMBRE_DEL_CLUSTER>` → el nombre exacto que le pusiste al cluster en el
  paso 1 (para que `${biohuerto-db.HOSTNAME}` etc. se resuelvan solos).
- Todos los `REPLACE_ME` (`APP_DB_PASSWORD`, `MIGRATION_DB_PASSWORD`,
  `SECRET_KEY`, `FERNET_KEY`, `PGCRYPTO_KEY`, `OPENAI_API_KEY`,
  `OPENROUTER_API_KEY`, `VAPID_*`, `VITE_GOOGLE_MAPS_API_KEY`).

No commitees el archivo con los secretos reales ya rellenados. Dos formas
seguras de completarlos:

```bash
doctl apps create --spec .do/app.yaml
# doctl te pedirá confirmar/editar los valores marcados type: SECRET
```

o crea la app con los placeholders y luego edítalos desde la consola web
(**App → Settings → *component* → Environment Variables**), donde quedan
cifrados y no vuelven a mostrarse en texto plano.

`PGCRYPTO_KEY` debe ser la **misma clave** usada al sembrar
`backend/db/bootstrap/02_seed.sql` (por defecto `bkey` en local; cámbiala ahí
y aquí si la rotas).

## 4. Deploy

Con el spec completo:

```bash
doctl apps create --spec .do/app.yaml
```

Orden de ejecución en cada deploy: el **Job** `migrate` corre como
`PRE_DEPLOY` (aplica `backend/db/migrations/*.sql` con `migration_user`) y
solo si termina bien, App Platform continúa con `backend`, `notification-worker`
y `frontend`.

## 5. Verificación

- `https://<tu-app>.ondigitalocean.app/health` → `{"status":"ok","database":"ok",...}`.
- `https://<tu-app>.ondigitalocean.app/docs` → Swagger UI.
- Revisa logs del Job `migrate` en la primera corrida (Apps → tu app →
  Activity/Runtime Logs) para confirmar que las migraciones aplicaron.

## Notas

- `CORS_ORIGINS` en el spec usa `${frontend.PUBLIC_URL}` (se resuelve solo);
  si luego apuntas un dominio propio, actualiza esa env var para incluirlo.
- Si prefieres NO usar Static Site para el frontend y seguir con el
  Caddy/Docker de `docker-compose.prod.yml` (por ejemplo, para desplegar en un
  Droplet en vez de App Platform), ese archivo sigue funcionando tal cual;
  no fue modificado.
