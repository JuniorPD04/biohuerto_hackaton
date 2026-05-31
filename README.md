# Biohuerto Inteligente - Hackathon USAT 2026

PMV para la gestion sostenible de biohuertos urbanos comunitarios de Lambayeque.

## Fase 1 implementada

- Docker Compose con PostgreSQL 16, backend FastAPI base y backup diario.
- Inicializacion SQL con `migration_user` para objetos/migraciones y `app_user` con privilegios minimos.
- Esquema completo del PMV: usuarios, biohuertos, cultivos, monitoreo, incidencias, alertas, diagnosticos, recomendaciones, cosechas, trazabilidad, costos, huella de carbono y cola de sync.
- Datos semilla: productor demo, consumidor demo, biohuerto demo, cultivos, monitoreo, alertas, cosechas, trazabilidad y costos.
- Endpoints publicos iniciales: `GET /health` y `GET /api/cosechas/public`.

## Requisitos

- Docker Desktop con Docker Compose.
- PowerShell en Windows.

## Ejecutar Fase 1

```powershell
Copy-Item .env.example .env
```

Edita `.env` y cambia las claves `change-me-*`. Para una demo local puedes mantener los nombres de usuarios fijos: `migration_user` y `app_user`.

```powershell
docker compose up --build
```

Verifica el backend:

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:8000/api/cosechas/public
```

Verifica la base de datos:

```powershell
docker compose exec db psql -U postgres -d biohuerto -c "\dt"
docker compose exec db psql -U postgres -d biohuerto -c "select email, rol from users order by id;"
docker compose exec db psql -U postgres -d biohuerto -c "select grantee, privilege_type from information_schema.role_table_grants where grantee = 'app_user' order by table_name, privilege_type limit 20;"
```

Credenciales demo de aplicacion para fases posteriores:

- Productor: `productor.demo@biohuerto.local` / `Demo123!`
- Consumidor: `consumidor.demo@biohuerto.local` / `Demo123!`
- Admin: `admin@biohuerto.local` / `Demo123!`

## Notas de seguridad ya aplicadas

- `.env` queda fuera de git.
- El backend lee configuracion desde variables de entorno.
- `OPENAI_MODEL_TEXT` y `OPENAI_MODEL_VISION` existen como variables; no se hardcodean nombres de modelos.
- `app_user` solo recibe `SELECT`, `INSERT` y `UPDATE` sobre tablas, y `USAGE/SELECT` sobre secuencias.
- Los campos sensibles quedan separados con sufijo `_encrypted` y comentarios `ENCRYPTED`.
- `/health` y el catalogo publico de cosechas no dependen de JWT.

