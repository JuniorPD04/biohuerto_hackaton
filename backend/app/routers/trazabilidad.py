from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.trazabilidad import (
    CostoCreate,
    CostoOut,
    PracticaCreate,
    PracticaOut,
    ProduccionHortalizaOut,
    ProduccionZonaOut,
    TrazabilidadResumen,
)
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/trazabilidad", tags=["trazabilidad"])

# Las columnas es_sostenible / sin_agroquimicos se derivan de la categoria de la practica.
_PRACTICA_SELECT = """
    select p.id::text as id, p.cultivo_id, tp.nombre as tipo, cp.nombre as categoria,
           p.descripcion, p.insumo_id, ins.nombre as insumo,
           p.cantidad, p.unidad_id, u.nombre as unidad,
           p.fecha_aplicacion as fecha,
           cp.es_sostenible as sostenible, cp.sin_agroquimicos,
           e.nombre as cultivo, b.id::text as biohuerto_id, b.nombre as biohuerto
    from practicas_agricolas p
    join tipos_practica tp on tp.id = p.tipo_id
    join categorias_practica cp on cp.id = tp.categoria_id
    left join insumos ins on ins.id = p.insumo_id
    left join unidades u on u.id = p.unidad_id
    left join cultivos cu on cu.id = p.cultivo_id
    left join especies e on e.id = cu.especie_id
    left join biohuertos b on b.id = cu.biohuerto_id
"""

_COSTO_SELECT = """
    select co.id::text as id, co.cultivo_id::text as cultivo_id, cc.nombre as categoria,
           co.descripcion, co.cantidad, co.unidad_id, u.nombre as unidad,
           co.monto, co.moneda, co.fecha,
           e.nombre as cultivo, b.id::text as biohuerto_id, b.nombre as biohuerto
    from costos_produccion co
    join categorias_costo cc on cc.id = co.categoria_id
    left join unidades u on u.id = co.unidad_id
    left join cultivos cu on cu.id = co.cultivo_id
    left join especies e on e.id = cu.especie_id
    left join biohuertos b on b.id = cu.biohuerto_id
"""


def _decimal(value) -> Decimal:
    return Decimal(str(value or 0))


def _to_practica_out(row) -> PracticaOut:
    return PracticaOut.model_validate(dict(row))


def _to_costo_out(row) -> CostoOut:
    return CostoOut.model_validate(dict(row))


@router.post("/practicas", response_model=PracticaOut, status_code=status.HTTP_201_CREATED)
async def create_practica(
    payload: PracticaCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> PracticaOut:
    await _ensure_cultivo_access(session, payload.cultivo_id, current_user)
    result = await session.execute(
        text(
            """
            insert into practicas_agricolas (
              cultivo_id, usuario_id, tipo_id, descripcion,
              insumo_id, cantidad, unidad_id, fecha_aplicacion
            )
            values (
              :cultivo_id, :usuario_id,
              (select id from tipos_practica where nombre = :tipo),
              :descripcion, :insumo_id, :cantidad,
              coalesce(:unidad_id, (select id from unidades where codigo = 'und')),
              :fecha_aplicacion
            )
            returning id
            """
        ),
        {
            "cultivo_id": payload.cultivo_id,
            "usuario_id": current_user.id,
            "tipo": payload.tipo,
            "descripcion": payload.descripcion,
            "insumo_id": payload.insumo_id,
            "cantidad": payload.cantidad,
            "unidad_id": payload.unidad_id,
            "fecha_aplicacion": payload.fecha,
        },
    )
    new_id = result.scalar_one()
    await session.commit()
    row = await session.execute(
        text(_PRACTICA_SELECT + " where p.id = :id and p.deleted_at is null"),
        {"id": new_id},
    )
    return _to_practica_out(row.mappings().one())


@router.get("/practicas", response_model=list[PracticaOut])
async def list_practicas(
    cultivo_id: UUID | None = None,
    biohuerto_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[PracticaOut]:
    params: dict = {"limit": limit}
    filters = ["p.deleted_at is null"]
    if cultivo_id is not None:
        await _ensure_cultivo_access(session, cultivo_id, current_user)
        filters.append("p.cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id
    if biohuerto_id:
        filters.append("cu.biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id

    result = await session.execute(
        text(
            _PRACTICA_SELECT
            + " where "
            + " and ".join(filters)
            + " order by p.fecha_aplicacion desc, p.created_at desc limit :limit"
        ),
        params,
    )
    return [_to_practica_out(row) for row in result.mappings().all()]


@router.post("/costos", response_model=CostoOut, status_code=status.HTTP_201_CREATED)
async def create_costo(
    payload: CostoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CostoOut:
    await _ensure_cultivo_access(session, payload.cultivo_id, current_user)
    result = await session.execute(
        text(
            """
            insert into costos_produccion (
              cultivo_id, usuario_id, categoria_id, descripcion,
              cantidad, unidad_id, monto, moneda, fecha
            )
            values (
              :cultivo_id, :usuario_id,
              (select id from categorias_costo where nombre = :categoria),
              :descripcion, :cantidad, :unidad_id, :monto, :moneda, :fecha
            )
            returning id
            """
        ),
        {
            "cultivo_id": payload.cultivo_id,
            "usuario_id": current_user.id,
            "categoria": payload.categoria,
            "descripcion": payload.descripcion,
            "cantidad": payload.cantidad,
            "unidad_id": payload.unidad_id,
            "monto": payload.monto,
            "moneda": payload.moneda,
            "fecha": payload.fecha,
        },
    )
    new_id = result.scalar_one()
    await session.commit()
    row = await session.execute(
        text(_COSTO_SELECT + " where co.id = :id and co.deleted_at is null"),
        {"id": new_id},
    )
    return _to_costo_out(row.mappings().one())


@router.get("/costos", response_model=list[CostoOut])
async def list_costos(
    cultivo_id: UUID | None = None,
    biohuerto_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CostoOut]:
    params: dict = {"limit": limit}
    filters = ["co.deleted_at is null"]
    if cultivo_id is not None:
        await _ensure_cultivo_access(session, cultivo_id, current_user)
        filters.append("co.cultivo_id = :cultivo_id")
        params["cultivo_id"] = cultivo_id
    if biohuerto_id:
        filters.append("cu.biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id

    result = await session.execute(
        text(
            _COSTO_SELECT
            + " where "
            + " and ".join(filters)
            + " order by co.fecha desc, co.created_at desc limit :limit"
        ),
        params,
    )
    return [_to_costo_out(row) for row in result.mappings().all()]


@router.get("/biohuertos/{biohuerto_id}/resumen", response_model=TrazabilidadResumen)
async def get_resumen_trazabilidad(
    biohuerto_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TrazabilidadResumen:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)

    cultivos = await session.execute(
        text(
            """
            select count(*)::int as total
            from cultivos
            where biohuerto_id = :biohuerto_id and deleted_at is null
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    cultivos_total = int((cultivos.scalar_one_or_none()) or 0)

    practicas = await session.execute(
        text(
            """
            select count(*)::int as total,
                   count(*) filter (where cp.es_sostenible = true)::int as sostenibles
            from practicas_agricolas p
            join tipos_practica tp on tp.id = p.tipo_id
            join categorias_practica cp on cp.id = tp.categoria_id
            join cultivos c on c.id = p.cultivo_id
            where c.biohuerto_id = :biohuerto_id
              and p.deleted_at is null
              and c.deleted_at is null
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    prow = practicas.mappings().first() or {}
    total_practicas = int(prow.get("total") or 0)
    sostenibles = int(prow.get("sostenibles") or 0)

    costos = await session.execute(
        text(
            """
            select coalesce(sum(co.monto), 0) as total
            from costos_produccion co
            join cultivos c on c.id = co.cultivo_id
            where c.biohuerto_id = :biohuerto_id
              and co.deleted_at is null
              and c.deleted_at is null
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    total_costos = _decimal(costos.scalar_one_or_none())

    return TrazabilidadResumen(
        biohuerto_id=str(biohuerto_id),
        total_practicas=total_practicas,
        total_costos=total_costos,
        practicas_sostenibles=sostenibles,
        cultivos=cultivos_total,
    )


@router.get("/produccion", response_model=list[ProduccionHortalizaOut])
async def get_produccion_por_hortaliza(
    usuario_id: int | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ProduccionHortalizaOut]:
    """Consolida, por hortaliza (especie), los datos del registro de
    producción: área, fechas, insumos, producción, autoconsumo, venta e
    inversión — una fila equivalente a la planilla de producción física."""
    params: dict = {"usuario_id": None}
    if current_user.rol != "admin":
        params["usuario_id"] = current_user.id
    elif usuario_id is not None:
        params["usuario_id"] = usuario_id

    result = await session.execute(
        text(
            """
            with cultivo_scope as (
              select c.id, c.especie_id, c.area_m2, c.fecha_siembra, c.fecha_estimada_cosecha
              from cultivos c
              where c.deleted_at is null
                and (cast(:usuario_id as bigint) is null or c.usuario_id = cast(:usuario_id as bigint))
            ),
            costos_insumos as (
              select cp.cultivo_id, sum(cp.monto) as inversion_insumos
              from costos_produccion cp
              join categorias_costo cc on cc.id = cp.categoria_id
              where cp.deleted_at is null and cc.nombre = 'Insumos'
              group by cp.cultivo_id
            ),
            compost_practicas as (
              select pa.cultivo_id, sum(pa.cantidad) as compost_kg
              from practicas_agricolas pa
              join insumos i on i.id = pa.insumo_id
              where pa.deleted_at is null and pa.cantidad is not null and i.nombre ilike '%compost%'
              group by pa.cultivo_id
            ),
            cosechas_agg as (
              select co.cultivo_id,
                     sum(co.cantidad_inicial) as produccion_total,
                     max(co.fecha_cosecha) as fecha_cosecha_real
              from cosechas co
              where co.deleted_at is null and co.cultivo_id is not null
              group by co.cultivo_id
            ),
            ventas_agg as (
              select co.cultivo_id, sum(v.cantidad) as venta_cantidad, sum(v.total) as venta_soles
              from ventas v
              join cosechas co on co.id = v.cosecha_id
              where v.deleted_at is null and co.cultivo_id is not null
              group by co.cultivo_id
            ),
            autoconsumo_agg as (
              select co.cultivo_id, sum(a.cantidad) as autoconsumo_total
              from autoconsumos a
              join cosechas co on co.id = a.cosecha_id
              where a.deleted_at is null and co.cultivo_id is not null
              group by co.cultivo_id
            )
            select e.nombre as hortaliza,
                   coalesce(sum(cs.area_m2), 0) as area_m2,
                   max(cs.fecha_siembra) as fecha_siembra,
                   max(coalesce(ca.fecha_cosecha_real, cs.fecha_estimada_cosecha)) as fecha_cosecha,
                   coalesce(sum(cp.compost_kg), 0) as compost_kg,
                   coalesce(sum(ci.inversion_insumos), 0) as inversion_insumos,
                   coalesce(sum(ca.produccion_total), 0) as produccion_total,
                   coalesce(sum(aa.autoconsumo_total), 0) as autoconsumo_total,
                   coalesce(sum(va.venta_cantidad), 0) as venta_cantidad,
                   coalesce(sum(va.venta_soles), 0) as venta_soles,
                   coalesce(sum(va.venta_soles), 0) - coalesce(sum(ci.inversion_insumos), 0) as utilidad
            from cultivo_scope cs
            join especies e on e.id = cs.especie_id
            left join costos_insumos ci on ci.cultivo_id = cs.id
            left join compost_practicas cp on cp.cultivo_id = cs.id
            left join cosechas_agg ca on ca.cultivo_id = cs.id
            left join ventas_agg va on va.cultivo_id = cs.id
            left join autoconsumo_agg aa on aa.cultivo_id = cs.id
            group by e.nombre
            order by e.nombre
            """
        ),
        params,
    )
    return [ProduccionHortalizaOut.model_validate(dict(row)) for row in result.mappings().all()]


@router.get("/produccion-zona", response_model=list[ProduccionZonaOut])
async def get_produccion_por_zona(
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[ProduccionZonaOut]:
    """Consolida la producción por zona geográfica del productor (ej. "Zona
    P.J."), para que la Coordinación Social compare entre zonas."""
    result = await session.execute(
        text(
            """
            with cultivo_scope as (
              select c.id, c.usuario_id, c.area_m2
              from cultivos c
              where c.deleted_at is null
            ),
            cosechas_agg as (
              select co.cultivo_id, sum(co.cantidad_inicial) as produccion_total
              from cosechas co
              where co.deleted_at is null and co.cultivo_id is not null
              group by co.cultivo_id
            ),
            ventas_agg as (
              select co.cultivo_id, sum(v.total) as venta_soles
              from ventas v
              join cosechas co on co.id = v.cosecha_id
              where v.deleted_at is null and co.cultivo_id is not null
              group by co.cultivo_id
            )
            select coalesce(u.zona, 'Sin zona asignada') as zona,
                   count(distinct u.id) as productores,
                   coalesce(sum(cs.area_m2), 0) as area_m2,
                   coalesce(sum(ca.produccion_total), 0) as produccion_total,
                   coalesce(sum(va.venta_soles), 0) as venta_soles
            from usuarios u
            join cultivo_scope cs on cs.usuario_id = u.id
            left join cosechas_agg ca on ca.cultivo_id = cs.id
            left join ventas_agg va on va.cultivo_id = cs.id
            where u.deleted_at is null
            group by coalesce(u.zona, 'Sin zona asignada')
            order by zona
            """
        )
    )
    return [ProduccionZonaOut.model_validate(dict(row)) for row in result.mappings().all()]
