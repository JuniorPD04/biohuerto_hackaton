# Biohuerto Inteligente - Hackathon USAT 2026

PMV funcional para la gestion sostenible de biohuertos urbanos comunitarios de Lambayeque, Peru.

## Estado del PMV

Implementado hasta Fase 7:

- Backend FastAPI + PostgreSQL 16.
- Frontend React + Vite + Tailwind, mobile-first.
- Docker Compose para DB, backend, frontend y backup.
- Usuarios, RBAC, biohuertos, cultivos, monitoreo, incidencias, alertas, diagnostico, recomendaciones, mercado, trazabilidad, costeo, dashboard, PDF y offline basico.
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
10. Offline: DevTools > Network > Offline, registrar monitoreo con incidencia, volver online y sincronizar.

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
GET      /api/cosechas/public
GET/POST /api/trazabilidad/practicas
GET/POST /api/trazabilidad/costos
GET      /api/dashboard/{biohuerto_id}
GET      /api/reportes/{biohuerto_id}/pdf
POST     /api/sync
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

El diagnostico guiado funciona sin API externa mediante fallback local. Para usar OpenAI:

```text
OPENAI_API_KEY=...
OPENAI_MODEL_TEXT=...
OPENAI_MODEL_VISION=...
```

La imagen es opcional. El PMV prioriza diagnostico guiado por formulario para mantener estabilidad.

## Offline

El modo offline cubre inicialmente monitoreo e incidencias:

- guarda registros en IndexedDB;
- muestra badge de pendientes;
- sincroniza con `/api/sync`;
- usa UUID para evitar conflictos;
- aplica politica `server-wins`.

No implementa offline completo para no comprometer el flujo principal.
