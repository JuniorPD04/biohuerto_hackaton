from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_role
from app.schemas.users import CurrentUser
from app.schemas.ventas import (
    VentaItemsCreate,
    VentaOut,
    VentaRondaCreate,
    VentaRondaDetalleOut,
    VentaRondaOut,
    VentaRondaUpdate,
)
from app.services import ventas_service

router = APIRouter(prefix="/api/ventas", tags=["ventas"])


@router.post("/rondas", response_model=VentaRondaOut, status_code=201)
async def crear_ronda(
    payload: VentaRondaCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> VentaRondaOut:
    return await ventas_service.crear_ronda(session, current_user, payload)


@router.get("/rondas", response_model=list[VentaRondaOut])
async def listar_rondas(
    estado: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario_id: int | None = None,
    q: str | None = None,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> list[VentaRondaOut]:
    return await ventas_service.listar_rondas(
        session,
        current_user,
        estado=estado,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        usuario_id=usuario_id,
        q=q,
    )


@router.get("/rondas/{ronda_id}", response_model=VentaRondaDetalleOut)
async def obtener_ronda(
    ronda_id: UUID,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> VentaRondaDetalleOut:
    return await ventas_service.obtener_ronda_detalle(session, current_user, ronda_id)


@router.patch("/rondas/{ronda_id}", response_model=VentaRondaOut)
async def actualizar_ronda(
    ronda_id: UUID,
    payload: VentaRondaUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> VentaRondaOut:
    return await ventas_service.cerrar_ronda(session, current_user, ronda_id)


@router.post("/rondas/{ronda_id}/ventas", response_model=VentaRondaDetalleOut, status_code=201)
async def confirmar_venta(
    ronda_id: UUID,
    payload: VentaItemsCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> VentaRondaDetalleOut:
    return await ventas_service.confirmar_venta(session, current_user, ronda_id, payload)


@router.get("", response_model=list[VentaOut])
async def listar_ventas(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    usuario_id: int | None = None,
    ronda_id: UUID | None = Query(default=None),
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> list[VentaOut]:
    return await ventas_service.listar_ventas_planas(
        session,
        current_user,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        usuario_id=usuario_id,
        ronda_id=ronda_id,
    )
