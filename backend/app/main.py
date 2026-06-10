import asyncio
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import AsyncSessionLocal, get_session, ping_database
from app.rate_limit import limiter
from app.routers import (
    alertas,
    auth,
    biohuertos,
    cosechas,
    cuidados,
    cultivos,
    dashboard,
    diagnostico,
    incidencias,
    monitoreo,
    recomendaciones,
    trazabilidad,
    users,
)
from app.services.rag import ensure_ingested

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
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(biohuertos.router)
app.include_router(cultivos.router)
app.include_router(monitoreo.router)
app.include_router(incidencias.router)
app.include_router(cuidados.router)
app.include_router(alertas.router)
app.include_router(trazabilidad.router)
app.include_router(diagnostico.router)
app.include_router(recomendaciones.router)
app.include_router(cosechas.router)
app.include_router(dashboard.router)


@app.on_event("startup")
async def _start_rag_ingestion() -> None:
    asyncio.create_task(ensure_ingested(AsyncSessionLocal))


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


@app.get("/api/public/cosechas", tags=["public"])
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
            cu.especie as cultivo,
            b.nombre as biohuerto,
            b.area_m2
        from cosechas c
        left join cultivos cu on cu.id = c.cultivo_id
        left join biohuertos b on b.id = cu.biohuerto_id
        where c.estado in ('disponible', 'publicado')
          and c.deleted_at is null
        order by c.fecha_cosecha desc, c.created_at desc
        limit 50
        """
    )
    try:
        result = await session.execute(query)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Catalogo no disponible") from exc

    return [dict(row._mapping) for row in result]
