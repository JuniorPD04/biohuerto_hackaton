# Biohuerto Inteligente - Hackathon USAT 2026

PMV funcional para la gestion sostenible de biohuertos urbanos comunitarios de Lambayeque, Peru.

## Estado del PMV

Implementado hasta Fase 7:

- Backend FastAPI + PostgreSQL 16.
- Frontend React + Vite + Tailwind, mobile-first.
- Docker Compose para DB, backend, frontend y backup.
- Usuarios, RBAC, biohuertos, cultivos, monitoreo, incidencias, alertas, diagnostico, recomendaciones, mercado, trazabilidad, costeo, dashboard, PDF y PWA local-first con SQLite.
- Tests backend de endpoints criticos.
- Guia de defensa en `docs/DEFENSA.md`.

## Demo Rapida

```powershell
Copy-Item .env.example .env
```

Edita `.env` y reemplaza los valores `change-me-*`. Genera `FERNET_KEY`:

```powershell
$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($bytes); [Convert]::ToBase64String($bytes).Replace('+','-').Replace('/','_')
```

Arranca todo:

```powershell
docker compose up --build
```

Produccion con HTTPS automatico (configura `APP_DOMAIN` y las claves VAPID):

```powershell
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Abre:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000/docs
Health:   http://localhost:8000/health
```

Credenciales demo:

```text
Productor:  productor.demo@biohuerto.pe / Demo123!
Consumidor: consumidor.demo@biohuerto.pe / Demo123!
Admin:      admin@biohuerto.pe / Demo123!
```

## Ejecutar Sin Docker

Backend:

```powershell
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
py run.py
```

Frontend:

```powershell
Set-Location frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

## Verificacion

Backend:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest tests
```

Frontend:

```powershell
Set-Location frontend
npm run build
```

Base de datos:

```powershell
docker compose exec db psql -U postgres -d biohuerto -c "\dt"
docker compose exec db psql -U postgres -d biohuerto -c "select email, rol from users order by id;"
docker compose exec db psql -U postgres -d biohuerto -c "select grantee, privilege_type from information_schema.role_table_grants where grantee = 'app_bio_user' order by table_name, privilege_type limit 20;"
```

## Flujo De Demo

1. Login con productor demo.
2. Dashboard: cultivos, alertas, costos, semaforo ambiental y CO2eq.
3. Biohuertos: ficha base del huerto.
4. Cultivos: ciclo productivo.
5. Monitoreo: registrar humedad, temperatura, luz e incidencia.
6. Diagnostico: usar formulario guiado y revisar recomendacion agroecologica.
7. Mercado: cosechas publicadas.
8. Trazabilidad: practicas sostenibles y costos.
9. Reporte: descargar PDF.
10. Instalar la PWA, pasar a modo offline, registrar trabajo de campo y volver online para sincronizar.
11. Desde Conexion y dispositivo, activar notificaciones de forma voluntaria.

## Endpoints Clave

Auth:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

PMV:

```text
GET/POST /api/biohuertos
GET/POST /api/cultivos
GET/POST /api/monitoreo
GET/POST /api/incidencias
GET/POST /api/alertas
POST     /api/diagnostico/guiado
POST     /api/diagnostico/imagen
GET      /api/recomendaciones
GET      /api/rag/status
POST     /api/rag/documentos
GET      /api/cosechas/public
GET/POST /api/trazabilidad/practicas
GET/POST /api/trazabilidad/costos
GET      /api/dashboard/{biohuerto_id}
GET      /api/reportes/{biohuerto_id}/pdf
POST     /api/sync
GET      /api/sync/bootstrap
POST     /api/notifications/subscriptions
GET/PUT  /api/notifications/preferences
GET      /api/notifications/admin/recipients
GET/POST /api/notifications/admin/campaigns
```

## Comandos API De Prueba

Login:

```powershell
$login = Invoke-RestMethod -Method Post http://localhost:8000/auth/login -ContentType "application/json" -SessionVariable session -Body (@{ email="productor.demo@biohuerto.pe"; password="Demo123!" } | ConvertTo-Json)
$token = $login.access_token
```

Usuario actual:

```powershell
Invoke-RestMethod http://localhost:8000/api/users/me -Headers @{ Authorization = "Bearer $token" }
```

Diagnostico guiado:

```powershell
Invoke-RestMethod -Method Post http://localhost:8000/api/diagnostico/guiado -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body (@{ biohuerto_id=1; especie="Tomate"; sintomas=@("manchas amarillas","hojas bajas afectadas"); zona_afectada="hojas"; tiempo_dias=3 } | ConvertTo-Json)
```

Descargar PDF:

```powershell
Invoke-WebRequest http://localhost:8000/api/reportes/1/pdf -Headers @{ Authorization = "Bearer $token" } -OutFile reporte_biohuerto_1.pdf
```

Sync offline manual:

```powershell
$uuid = [guid]::NewGuid().ToString()
Invoke-RestMethod -Method Post http://localhost:8000/api/sync -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body (@{ registros=@(@{ tabla="monitoreo_registros"; uuid=$uuid; created_at_local=(Get-Date).ToUniversalTime().ToString("o"); payload=@{ biohuerto_id=1; humedad_porcentaje="60.00"; observacion="Registro offline demo" } }) } | ConvertTo-Json -Depth 6)
```

## Seguridad Aplicada

- Access token en memoria de React.
- Refresh token en cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
- Sin `localStorage` ni `sessionStorage` para tokens.
- Endpoints publicos sin JWT: `/auth/register`, `/auth/login`, `/auth/refresh`, `/health`, `/api/cosechas/public`.
- RBAC para `productor`, `consumidor`, `admin`.
- Rate limiting con `slowapi`.
- CORS con origen explicito.
- Cabeceras HTTP de seguridad.
- SQL parametrizado con SQLAlchemy.
- Campos sensibles preparados para Fernet.
- `.env` fuera de git.
- `migration_user` para init/migraciones y `app_bio_user` con privilegios minimos.
- `OPENAI_MODEL_TEXT` y `OPENAI_MODEL_VISION`; no se hardcodean modelos.

## IA

El diagnostico guiado funciona sin API externa mediante fallback local. Para usar RAG:

```text
OPENAI_API_KEY=...          # embeddings para pgvector
OPENAI_EMBED_MODEL=text-embedding-3-small
OPENROUTER_API_KEY=...     # LLM de texto/vision
OPENROUTER_MODEL_TEXT=...
OPENROUTER_MODEL_VISION=...
RAG_UPLOAD_MAX_MB=25
```

La imagen es opcional. El PMV prioriza diagnostico guiado por formulario para mantener estabilidad.
La pantalla `/rag` permite que un administrador suba PDFs; el backend los convierte a Markdown con Microsoft MarkItDown, genera embeddings y guarda los fragmentos en `rag_chunks` de pgvector.

## PWA, SQLite y modo offline

- SQLite WASM persiste en OPFS por usuario y se ejecuta en un Web Worker.
- Biohuertos, cultivos, monitoreo, incidencias, cuidados, trazabilidad y cosechas aceptan cambios offline.
- Los payloads locales se cifran con Web Crypto y las operaciones usan UUID idempotentes.
- Al recuperar conexion, `/api/sync` envia la cola y descarga cambios incrementales.
- Los conflictos conservan ambas versiones y se resuelven desde Conexion y dispositivo.
- IA, RAG, PDF, mapas remotos y administracion requieren conexion.
- El permiso de notificaciones nunca se solicita automaticamente.
- El superadministrador dispone de `/notificaciones` para enviar campañas a una persona, una seleccion o todos los usuarios activos, con imagen opcional, historial y reutilizacion.

Las migraciones PostgreSQL viven en `backend/db/migrations`; el bootstrap y seed estan en
`backend/db/bootstrap`. Las migraciones SQLite que viajan con la PWA viven en
`frontend/src/db/migrations`.
