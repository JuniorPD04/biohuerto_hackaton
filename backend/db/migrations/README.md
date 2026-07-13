# Migraciones de base de datos

Scripts SQL para **actualizar una base de datos ya existente** sin resetearla.

Los archivos de `backend/db/bootstrap` solo se ejecutan cuando la BD se crea **desde cero**
(volumen vacío). Si ya tienes datos y haces un cambio de esquema, ese cambio
**no** llega a las BD existentes (la tuya, la de tus compañeros, la del demo).
Para eso están las migraciones: cada cambio de esquema se deja aquí como un
`.sql` numerado, y cada quien lo corre contra su BD.

## Regla de oro

> **Si cambias el esquema base, crea aquí la migración equivalente.**

1. Aplica el cambio en `backend/db/bootstrap/01_init.sql` (fuente de verdad para BD nuevas).
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

Al iniciar localmente con `python run.py`, las migraciones se aplican de forma
automatica usando `MIGRATION_DB_PASSWORD`. Puede desactivarse con
`AUTO_MIGRATE=false` solo para tareas que no inicien la aplicacion.

## Migraciones

| #   | Archivo                       | Cambio                                            |
| --- | ----------------------------- | ------------------------------------------------- |
| 001 | `001_usuarios_lat_lng.sql`    | `usuarios`: agrega `latitud` y `longitud` (mapa). |
| 002 | `002_local_first_sync_notifications.sql` | Sincronizacion y Web Push. |
| 003 | `003_admin_notification_campaigns.sql` | Campañas manuales del superadministrador. |
| 004 | `004_repair_notification_deliveries.sql` | Repara una migracion 002 incompleta. |
| 005 | `005_ventas.sql` | Punto de venta directo: rondas de venta, ventas y permiso `ventas.gestion`. |
| 006 | `006_produccion.sql` | Autoconsumo (tabla `autoconsumos`) y `cosechas.cantidad_inicial` para el registro de producción. |
| 007 | `007_zona_y_catalogos.sql` | `usuarios.zona` (reportes por zona) y catálogos "Preparación de terreno" / "RRSSOO". |
| 008 | `008_registro_produccion_v2.sql` | Modalidad del biohuerto (comunitario/casero), `metodos_practica` (+seed), `actividades` y `dedicaciones` (horas por persona), unidad "hora", categorías de costo Semilla/Abono/Mejorador, y vista RBAC `reportes.gestion`. |
| 009 | `009_demo_logins.sql` | Fija la contraseña de demo `biohuerto2026` a un productor y un consumidor para probar los tres paneles. |
| 010 | `010_comunidades.sql` | Catálogo `comunidades` (P.J., +seed) y `biohuertos.comunidad_id`: la comunidad es atributo de ubicación del biohuerto (una comunidad agrupa varios biohuertos). |
| 011 | `011_drop_campanias.sql` | Elimina `cultivos.campania_id` y la tabla `campanias`: la campaña pasa a ser un calendario (timeline) DERIVADO por cultivo (prácticas + siembra + cosecha). |
| 012 | `012_seed_demo.sql` | Datos DEMO (no cambia esquema): llena tablas vacías (cuidados, dedicaciones, autoconsumos, ventas, huella) y completa cultivos sin hijos + asigna comunidad/modalidad a biohuertos. Idempotente. |
