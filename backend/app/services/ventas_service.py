import re
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.users import CurrentUser
from app.schemas.ventas import (
    VentaItemsCreate,
    VentaOut,
    VentaRondaCreate,
    VentaRondaDetalleOut,
    VentaRondaOut,
)

_RONDA_SELECT = """
    select r.id::text, r.usuario_id, u.nombre as productor, r.nombre, r.fecha, r.hora_inicio, r.estado,
           r.created_at, r.updated_at,
           coalesce(count(v.id), 0) as total_items,
           coalesce(sum(v.total), 0) as total_monto
    from venta_rondas r
    left join usuarios u on u.id = r.usuario_id
    left join ventas v on v.ronda_id = r.id and v.deleted_at is null
"""

_VENTA_SELECT = """
    select v.id::text, v.ronda_id::text, v.cosecha_id::text, v.usuario_id, v.nombre_producto, v.cultivo,
           v.precio_unitario, v.cantidad, v.unidad_id, un.codigo as unidad, v.total, v.fecha, v.hora, v.created_at
    from ventas v
    left join unidades un on un.id = v.unidad_id
"""


def _dedupe_nombre(base: str, existentes: list[str]) -> str:
    """Si `base` ya existe para el productor, agrega el siguiente sufijo `-N` libre."""
    existentes_set = set(existentes)
    if base not in existentes_set:
        return base
    patron = re.compile(re.escape(base) + r"-(\d+)$")
    max_n = 0
    for nombre in existentes_set:
        m = patron.match(nombre)
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"{base}-{max_n + 1}"


async def _resolver_productor_id(
    session: AsyncSession, current_user: CurrentUser, usuario_id: int | None
) -> int:
    if usuario_id is None or usuario_id == current_user.id:
        return current_user.id
    if current_user.rol != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un administrador puede abrir una ronda para otro productor",
        )
    result = await session.execute(
        text(
            """
            select u.id from usuarios u
            join roles r on r.id = u.rol_id
            where u.id = :id and u.deleted_at is null and u.is_active = true and r.codigo = 'productor'
            """
        ),
        {"id": usuario_id},
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Productor no encontrado o inactivo")
    return usuario_id


async def _fetch_ronda(session: AsyncSession, ronda_id) -> VentaRondaOut:
    result = await session.execute(
        text(_RONDA_SELECT + " where r.id = :id and r.deleted_at is null group by r.id, u.nombre"),
        {"id": ronda_id},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ronda de venta no encontrada")
    return VentaRondaOut.model_validate(dict(row))


async def _fetch_ronda_detalle(session: AsyncSession, ronda_id) -> VentaRondaDetalleOut:
    ronda = await _fetch_ronda(session, ronda_id)
    items = await session.execute(
        text(_VENTA_SELECT + " where v.ronda_id = :id and v.deleted_at is null order by v.created_at desc"),
        {"id": ronda_id},
    )
    item_rows = [VentaOut.model_validate(dict(r)) for r in items.mappings().all()]
    return VentaRondaDetalleOut(**ronda.model_dump(), items=item_rows)


async def _ensure_ronda_access(session: AsyncSession, ronda_id, current_user: CurrentUser):
    result = await session.execute(
        text("select usuario_id, estado from venta_rondas where id = :id and deleted_at is null"),
        {"id": ronda_id},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ronda de venta no encontrada")
    if current_user.rol != "admin" and row["usuario_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes acceder a esta ronda de venta")
    return row


async def crear_ronda(
    session: AsyncSession, current_user: CurrentUser, payload: VentaRondaCreate
) -> VentaRondaOut:
    productor_id = await _resolver_productor_id(session, current_user, payload.usuario_id)

    await session.execute(
        text("select pg_advisory_xact_lock(hashtext('venta_ronda:' || :uid))"),
        {"uid": str(productor_id)},
    )

    base_nombre = payload.nombre.strip()
    existentes = (
        await session.execute(
            text("select nombre from venta_rondas where usuario_id = :uid and deleted_at is null"),
            {"uid": productor_id},
        )
    ).scalars().all()
    nombre_final = _dedupe_nombre(base_nombre, existentes)

    result = await session.execute(
        text(
            """
            insert into venta_rondas (usuario_id, nombre, fecha, hora_inicio, estado)
            values (:usuario_id, :nombre, coalesce(:fecha, CURRENT_DATE), coalesce(:hora_inicio, LOCALTIME), 'abierta')
            returning id
            """
        ),
        {
            "usuario_id": productor_id,
            "nombre": nombre_final,
            "fecha": payload.fecha,
            "hora_inicio": payload.hora_inicio,
        },
    )
    ronda_id = result.scalar_one()
    await session.commit()
    return await _fetch_ronda(session, ronda_id)


async def cerrar_ronda(session: AsyncSession, current_user: CurrentUser, ronda_id) -> VentaRondaOut:
    await _ensure_ronda_access(session, ronda_id, current_user)
    await session.execute(
        text("update venta_rondas set estado = 'cerrada' where id = :id and deleted_at is null"),
        {"id": ronda_id},
    )
    await session.commit()
    return await _fetch_ronda(session, ronda_id)


async def obtener_ronda_detalle(
    session: AsyncSession, current_user: CurrentUser, ronda_id
) -> VentaRondaDetalleOut:
    await _ensure_ronda_access(session, ronda_id, current_user)
    return await _fetch_ronda_detalle(session, ronda_id)


async def confirmar_venta(
    session: AsyncSession, current_user: CurrentUser, ronda_id, payload: VentaItemsCreate
) -> VentaRondaDetalleOut:
    ronda = await _ensure_ronda_access(session, ronda_id, current_user)
    if ronda["estado"] != "abierta":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La ronda de venta esta cerrada")

    items_ordenados = sorted(payload.items, key=lambda item: str(item.cosecha_id))
    for item in items_ordenados:
        cosecha = (
            await session.execute(
                text(
                    """
                    select id, usuario_id, nombre_producto, estado, cantidad, precio_referencial,
                           unidad_id, cultivo_id
                    from cosechas
                    where id = :id and deleted_at is null
                    for update
                    """
                ),
                {"id": item.cosecha_id},
            )
        ).mappings().first()
        if cosecha is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
        if cosecha["usuario_id"] != ronda["usuario_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"No puedes vender \"{cosecha['nombre_producto']}\": no te pertenece",
            )
        if cosecha["estado"] not in ("disponible", "publicado"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"\"{cosecha['nombre_producto']}\" no esta disponible para venta",
            )
        if Decimal(cosecha["cantidad"]) < item.cantidad:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Stock insuficiente para \"{cosecha['nombre_producto']}\" "
                f"(disponible: {cosecha['cantidad']})",
            )

        cultivo_nombre = None
        if cosecha["cultivo_id"] is not None:
            cultivo_nombre = (
                await session.execute(
                    text(
                        "select e.nombre from cultivos c join especies e on e.id = c.especie_id where c.id = :id"
                    ),
                    {"id": cosecha["cultivo_id"]},
                )
            ).scalar_one_or_none()

        await session.execute(
            text(
                """
                insert into ventas (ronda_id, cosecha_id, usuario_id, nombre_producto, cultivo,
                                     precio_unitario, cantidad, unidad_id, fecha, hora)
                values (:ronda_id, :cosecha_id, :usuario_id, :nombre_producto, :cultivo,
                        :precio_unitario, :cantidad, :unidad_id, CURRENT_DATE, LOCALTIME)
                """
            ),
            {
                "ronda_id": ronda_id,
                "cosecha_id": cosecha["id"],
                "usuario_id": ronda["usuario_id"],
                "nombre_producto": cosecha["nombre_producto"],
                "cultivo": cultivo_nombre,
                "precio_unitario": cosecha["precio_referencial"],
                "cantidad": item.cantidad,
                "unidad_id": cosecha["unidad_id"],
            },
        )
        await session.execute(
            text(
                """
                update cosechas
                set cantidad = cantidad - :cantidad,
                    estado = case when cantidad - :cantidad <= 0 then 'agotado' else estado end
                where id = :id
                """
            ),
            {"cantidad": item.cantidad, "id": cosecha["id"]},
        )

    await session.commit()
    return await _fetch_ronda_detalle(session, ronda_id)


async def listar_rondas(
    session: AsyncSession,
    current_user: CurrentUser,
    *,
    estado: str | None = None,
    fecha_desde=None,
    fecha_hasta=None,
    usuario_id: int | None = None,
    q: str | None = None,
) -> list[VentaRondaOut]:
    filters = ["r.deleted_at is null"]
    params: dict = {}
    if current_user.rol != "admin":
        filters.append("r.usuario_id = :usuario_id")
        params["usuario_id"] = current_user.id
    elif usuario_id is not None:
        filters.append("r.usuario_id = :usuario_id")
        params["usuario_id"] = usuario_id
    if estado is not None:
        filters.append("r.estado = :estado")
        params["estado"] = estado
    if fecha_desde is not None:
        filters.append("r.fecha >= :fecha_desde")
        params["fecha_desde"] = fecha_desde
    if fecha_hasta is not None:
        filters.append("r.fecha <= :fecha_hasta")
        params["fecha_hasta"] = fecha_hasta
    if q:
        filters.append("r.nombre ilike :q")
        params["q"] = f"%{q}%"

    result = await session.execute(
        text(
            _RONDA_SELECT
            + " where "
            + " and ".join(filters)
            + " group by r.id, u.nombre order by r.fecha desc, r.hora_inicio desc"
        ),
        params,
    )
    return [VentaRondaOut.model_validate(dict(row)) for row in result.mappings().all()]


async def listar_ventas_planas(
    session: AsyncSession,
    current_user: CurrentUser,
    *,
    fecha_desde=None,
    fecha_hasta=None,
    usuario_id: int | None = None,
    ronda_id=None,
) -> list[VentaOut]:
    filters = ["v.deleted_at is null"]
    params: dict = {}
    if current_user.rol != "admin":
        filters.append("v.usuario_id = :usuario_id")
        params["usuario_id"] = current_user.id
    elif usuario_id is not None:
        filters.append("v.usuario_id = :usuario_id")
        params["usuario_id"] = usuario_id
    if ronda_id is not None:
        filters.append("v.ronda_id = :ronda_id")
        params["ronda_id"] = ronda_id
    if fecha_desde is not None:
        filters.append("v.fecha >= :fecha_desde")
        params["fecha_desde"] = fecha_desde
    if fecha_hasta is not None:
        filters.append("v.fecha <= :fecha_hasta")
        params["fecha_hasta"] = fecha_hasta

    result = await session.execute(
        text(_VENTA_SELECT + " where " + " and ".join(filters) + " order by v.fecha desc, v.hora desc"),
        params,
    )
    return [VentaOut.model_validate(dict(row)) for row in result.mappings().all()]
