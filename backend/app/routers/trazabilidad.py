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
    ReporteComunidadOut,
    TrazabilidadResumen,
)
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/trazabilidad", tags=["trazabilidad"])

# Las columnas es_sostenible / sin_agroquimicos se derivan de la categoria de la practica.
_PRACTICA_SELECT = """
    select p.id::text as id, p.cultivo_id, tp.nombre as tipo, cp.nombre as categoria,
           p.metodo_id, mp.nombre as metodo,
           p.descripcion, p.insumo_id, ins.nombre as insumo,
           p.cantidad, p.unidad_id, u.nombre as unidad,
           p.fecha_aplicacion as fecha,
           cp.es_sostenible as sostenible, cp.sin_agroquimicos,
           e.nombre as cultivo, b.id::text as biohuerto_id, b.nombre as biohuerto
    from practicas_agricolas p
    join tipos_practica tp on tp.id = p.tipo_id
    join categorias_practica cp on cp.id = tp.categoria_id
    left join metodos_practica mp on mp.id = p.metodo_id
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
           case when co.cantidad is not null and co.cantidad > 0
                then round(co.monto / co.cantidad, 2) end as costo_unitario,
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
              cultivo_id, usuario_id, tipo_id, metodo_id, descripcion,
              insumo_id, cantidad, unidad_id, fecha_aplicacion
            )
            values (
              :cultivo_id, :usuario_id,
              (select id from tipos_practica where nombre = :tipo),
              :metodo_id,
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
            "metodo_id": payload.metodo_id,
            "descripcion": payload.descripcion or "",
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
              select pa.cultivo_id,
                     sum(pa.cantidad) as compost_kg,
                     max(pa.fecha_aplicacion) as fecha_compost
              from practicas_agricolas pa
              join insumos i on i.id = pa.insumo_id
              where pa.deleted_at is null and pa.cantidad is not null and i.nombre ilike '%compost%'
              group by pa.cultivo_id
            ),
            rrssoo_practicas as (
              select pa.cultivo_id, sum(pa.cantidad) as rrssoo_kg
              from practicas_agricolas pa
              join insumos i on i.id = pa.insumo_id
              where pa.deleted_at is null and pa.cantidad is not null and i.nombre ilike '%RRSSOO%'
              group by pa.cultivo_id
            ),
            prep_practicas as (
              select pa.cultivo_id, max(pa.fecha_aplicacion) as fecha_preparacion
              from practicas_agricolas pa
              join tipos_practica tp on tp.id = pa.tipo_id
              where pa.deleted_at is null and tp.nombre = 'Preparación de terreno'
              group by pa.cultivo_id
            ),
            otros_insumos_especie as (
              select cu.especie_id, string_agg(distinct i.nombre, ', ' order by i.nombre) as otros_insumos
              from practicas_agricolas pa
              join cultivos cu on cu.id = pa.cultivo_id
              join insumos i on i.id = pa.insumo_id
              where pa.deleted_at is null and cu.deleted_at is null
                and i.nombre not ilike '%compost%' and i.nombre not ilike '%RRSSOO%'
                and (cast(:usuario_id as bigint) is null or cu.usuario_id = cast(:usuario_id as bigint))
              group by cu.especie_id
            ),
            cosechas_agg as (
              select co.cultivo_id,
                     sum(co.cantidad_inicial) as produccion_total,
                     max(co.fecha_cosecha) as fecha_cosecha_real,
                     max(un.nombre) as unidad_nombre
              from cosechas co
              left join unidades un on un.id = co.unidad_id
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
                   max(pp.fecha_preparacion) as fecha_preparacion,
                   max(cs.fecha_siembra) as fecha_siembra,
                   max(coalesce(ca.fecha_cosecha_real, cs.fecha_estimada_cosecha)) as fecha_cosecha,
                   coalesce(sum(cp.compost_kg), 0) as compost_kg,
                   max(cp.fecha_compost) as fecha_compost,
                   coalesce(sum(rp.rrssoo_kg), 0) as rrssoo_kg,
                   max(oie.otros_insumos) as otros_insumos,
                   coalesce(sum(ci.inversion_insumos), 0) as inversion_insumos,
                   coalesce(sum(ca.produccion_total), 0) as produccion_total,
                   coalesce(max(ca.unidad_nombre), 'Kilogramo') as produccion_unidad,
                   coalesce(sum(aa.autoconsumo_total), 0) as autoconsumo_total,
                   coalesce(sum(va.venta_cantidad), 0) as venta_cantidad,
                   coalesce(sum(va.venta_soles), 0) as venta_soles,
                   coalesce(sum(va.venta_soles), 0) - coalesce(sum(ci.inversion_insumos), 0) as utilidad
            from cultivo_scope cs
            join especies e on e.id = cs.especie_id
            left join costos_insumos ci on ci.cultivo_id = cs.id
            left join compost_practicas cp on cp.cultivo_id = cs.id
            left join rrssoo_practicas rp on rp.cultivo_id = cs.id
            left join prep_practicas pp on pp.cultivo_id = cs.id
            left join cosechas_agg ca on ca.cultivo_id = cs.id
            left join ventas_agg va on va.cultivo_id = cs.id
            left join autoconsumo_agg aa on aa.cultivo_id = cs.id
            left join otros_insumos_especie oie on oie.especie_id = e.id
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


@router.get("/reporte-comunidad", response_model=list[ReporteComunidadOut])
async def get_reporte_comunidad(
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[ReporteComunidadOut]:
    """Reporte por comunidad (hoja "Ingresos Comunit" de la ficha): desglose
    comunitario/individual, siembras/cosechas, insumos orgánicos, producción,
    consumo, inversión e ingresos. La comunidad se toma de la zona del productor."""
    result = await session.execute(
        text(
            """
            with base as (
              select c.id as cultivo_id, c.usuario_id, c.biohuerto_id,
                     coalesce(cm.nombre, 'Sin comunidad asignada') as comunidad,
                     coalesce(m.codigo, 'casero') as modalidad,
                     b.area_m2 as bio_area
              from cultivos c
              join usuarios u on u.id = c.usuario_id
              join biohuertos b on b.id = c.biohuerto_id
              left join modalidades m on m.id = b.modalidad_id
              left join comunidades cm on cm.id = b.comunidad_id
              where c.deleted_at is null and u.deleted_at is null and b.deleted_at is null
            ),
            bio_dim as (select distinct comunidad, biohuerto_id, modalidad, bio_area from base),
            bio_counts as (
              select comunidad,
                count(*) filter (where modalidad = 'comunitario') as biohuertos_comunitarios,
                count(*) filter (where modalidad = 'casero')      as biohuertos_caseros,
                coalesce(sum(bio_area) filter (where modalidad = 'comunitario'), 0) as area_comunitaria,
                coalesce(sum(bio_area) filter (where modalidad = 'casero'), 0)      as area_casera
              from bio_dim group by comunidad
            ),
            cosechas_c as (
              select cultivo_id, count(*) as n_cos, sum(cantidad_inicial) as produccion_total
              from cosechas where deleted_at is null and cultivo_id is not null group by cultivo_id
            ),
            ventas_c as (
              select co.cultivo_id, sum(v.cantidad) as venta_cantidad, sum(v.total) as ingresos
              from ventas v join cosechas co on co.id = v.cosecha_id
              where v.deleted_at is null and co.cultivo_id is not null group by co.cultivo_id
            ),
            auto_c as (
              select co.cultivo_id, sum(a.cantidad) as autoconsumo_total
              from autoconsumos a join cosechas co on co.id = a.cosecha_id
              where a.deleted_at is null and co.cultivo_id is not null group by co.cultivo_id
            ),
            costos_c as (
              select cultivo_id, sum(monto) as inversion
              from costos_produccion where deleted_at is null group by cultivo_id
            ),
            compost_c as (
              select pa.cultivo_id, sum(pa.cantidad) as compost_kg
              from practicas_agricolas pa join insumos i on i.id = pa.insumo_id
              where pa.deleted_at is null and pa.cantidad is not null and i.nombre ilike '%compost%'
              group by pa.cultivo_id
            ),
            rrssoo_c as (
              select pa.cultivo_id, sum(pa.cantidad) as rrssoo_kg
              from practicas_agricolas pa join insumos i on i.id = pa.insumo_id
              where pa.deleted_at is null and pa.cantidad is not null and i.nombre ilike '%RRSSOO%'
              group by pa.cultivo_id
            )
            select b.comunidad,
                   coalesce(bc.biohuertos_comunitarios, 0) as biohuertos_comunitarios,
                   coalesce(bc.biohuertos_caseros, 0)      as biohuertos_caseros,
                   coalesce(bc.area_comunitaria, 0)        as area_comunitaria,
                   coalesce(bc.area_casera, 0)             as area_casera,
                   count(distinct b.usuario_id)            as hogares,
                   count(distinct b.cultivo_id)            as siembras,
                   coalesce(sum(cc.n_cos), 0)              as cosechas,
                   coalesce(sum(rr.rrssoo_kg), 0)          as rrssoo_kg,
                   coalesce(sum(cm.compost_kg), 0)         as compost_kg,
                   coalesce(sum(cc.produccion_total), 0)   as produccion_total,
                   coalesce(sum(ac.autoconsumo_total), 0)  as autoconsumo_total,
                   coalesce(sum(vc.venta_cantidad), 0)     as venta_cantidad,
                   coalesce(sum(co.inversion), 0)          as inversion,
                   coalesce(sum(vc.ingresos), 0)           as ingresos
            from base b
            left join bio_counts bc on bc.comunidad = b.comunidad
            left join cosechas_c cc on cc.cultivo_id = b.cultivo_id
            left join ventas_c vc on vc.cultivo_id = b.cultivo_id
            left join auto_c ac on ac.cultivo_id = b.cultivo_id
            left join costos_c co on co.cultivo_id = b.cultivo_id
            left join compost_c cm on cm.cultivo_id = b.cultivo_id
            left join rrssoo_c rr on rr.cultivo_id = b.cultivo_id
            group by b.comunidad, bc.biohuertos_comunitarios, bc.biohuertos_caseros,
                     bc.area_comunitaria, bc.area_casera
            order by b.comunidad
            """
        )
    )
    return [ReporteComunidadOut.model_validate(dict(row)) for row in result.mappings().all()]
