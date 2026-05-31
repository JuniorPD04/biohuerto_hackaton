from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session, ping_database

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="PMV para gestion sostenible de biohuertos urbanos.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next: Any):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin"
    return response


@app.get("/health", tags=["public"])
async def health() -> dict[str, str]:
    db_ok = await ping_database()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "ok" if db_ok else "unavailable",
        "environment": settings.environment,
    }


@app.get("/api/cosechas/public", tags=["public"])
async def public_harvest_catalog(
    session: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    query = text(
        """
        select
            c.id::text,
            c.nombre_producto,
            c.cantidad,
            c.unidad,
            c.precio_referencial,
            c.fecha_cosecha,
            c.foto_url,
            c.contacto_publico,
            b.nombre as biohuerto,
            b.area_m2
        from cosechas c
        join biohuertos b on b.id = c.biohuerto_id
        where c.disponible = true
          and c.deleted_at is null
          and b.deleted_at is null
        order by c.fecha_cosecha desc, c.created_at desc
        limit 50
        """
    )
    try:
        result = await session.execute(query)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Catalogo no disponible") from exc

    return [dict(row._mapping) for row in result]

