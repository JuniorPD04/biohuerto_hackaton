"""Aplica las migraciones PostgreSQL idempotentes usando migration_user."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import asyncpg
from sqlalchemy.engine import make_url


BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'").strip('"'))


async def apply_migrations() -> None:
    _load_env_file(ROOT_DIR / ".env")
    _load_env_file(BACKEND_DIR / ".env")
    database_url = os.environ.get("DATABASE_URL")
    password = os.environ.get("MIGRATION_DB_PASSWORD")
    if not database_url or not password:
        raise RuntimeError("DATABASE_URL y MIGRATION_DB_PASSWORD son obligatorios para migrar")

    url = make_url(database_url)
    connection = await asyncpg.connect(
        host=url.host or "127.0.0.1",
        port=url.port or 5432,
        user="migration_user",
        password=password,
        database=url.database,
    )
    try:
        for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
            print(f"Aplicando {migration.name}", flush=True)
            sql = migration.read_text(encoding="utf-8-sig")
            try:
                async with connection.transaction():
                    await connection.execute(sql)
            except asyncpg.InsufficientPrivilegeError as exc:
                # Algunas bases antiguas tienen objetos creados por postgres.
                # Las migraciones de reparacion posteriores siguen siendo
                # aplicables y no deben quedar bloqueadas por ese legado.
                print(f"Omitida por propiedad heredada: {exc}", flush=True)
        relation = await connection.fetchval("select to_regclass('public.notification_deliveries')")
        if relation is None:
            raise RuntimeError("La tabla notification_deliveries no fue creada")
        app_connection = await asyncpg.connect(
            host=url.host or "127.0.0.1",
            port=url.port or 5432,
            user=url.username or "app_bio_user",
            password=url.password,
            database=url.database,
        )
        try:
            await app_connection.fetchval("select count(*) from notification_deliveries")
        finally:
            await app_connection.close()
        print("Migraciones PostgreSQL aplicadas", flush=True)
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(apply_migrations())
