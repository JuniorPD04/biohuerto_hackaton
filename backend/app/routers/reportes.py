from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.schemas.users import CurrentUser
from app.services.dashboard_service import build_dashboard
from app.services.pdf_service import build_biohuerto_report_pdf

router = APIRouter(prefix="/api/reportes", tags=["reportes"])


def _num(value) -> float:
    return float(value or 0)


@router.get("/{biohuerto_id}/pdf")
async def download_biohuerto_pdf(
    biohuerto_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    dashboard = await build_dashboard(session, biohuerto_id)

    biohuerto_result = await session.execute(
        text(
            """
            select id::text as id, nombre, codigo, area_m2, descripcion, created_at, updated_at
            from biohuertos
            where id = :biohuerto_id
              and deleted_at is null
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    biohuerto = dict(biohuerto_result.mappings().one())

    cultivos_result = await session.execute(
        text(
            """
            select e.nombre as especie, ef.nombre as etapa,
                   c.fecha_siembra, c.fecha_estimada_cosecha
            from cultivos c
            join especies e on e.id = c.especie_id
            join etapas_fenologicas ef on ef.id = c.etapa_id
            where c.biohuerto_id = :biohuerto_id
              and c.deleted_at is null
            order by c.created_at desc
            limit 12
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    cultivos = [dict(row) for row in cultivos_result.mappings().all()]

    costos_result = await session.execute(
        text(
            """
            select cc.nombre as categoria, cp.descripcion, cp.monto, cp.moneda, cp.fecha
            from costos_produccion cp
            join cultivos c on c.id = cp.cultivo_id
            join categorias_costo cc on cc.id = cp.categoria_id
            where c.biohuerto_id = :biohuerto_id
              and cp.deleted_at is null
              and c.deleted_at is null
            order by cp.fecha desc, cp.created_at desc
            limit 12
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    costos = [dict(row) for row in costos_result.mappings().all()]

    pdf = build_biohuerto_report_pdf(
        biohuerto=biohuerto,
        dashboard=dashboard,
        cultivos=cultivos,
        costos=costos,
    )
    filename = f"reporte_biohuerto_{biohuerto_id}.pdf"
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/general")
async def reporte_general(
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """KPIs globales del proyecto + huella de carbono y sostenibilidad."""
    kpis = (
        await session.execute(
            text(
                """
                with prod as (
                  select coalesce(sum(cantidad_inicial), 0) as produccion_kg
                  from cosechas where deleted_at is null
                ),
                ventas_agg as (
                  select coalesce(sum(total), 0) as ingresos, coalesce(sum(cantidad), 0) as venta_kg
                  from ventas where deleted_at is null
                ),
                auto as (
                  select coalesce(sum(cantidad), 0) as autoconsumo_kg
                  from autoconsumos where deleted_at is null
                )
                select
                  (select count(*) from biohuertos where deleted_at is null and is_active) as biohuertos,
                  (select count(distinct u.id) from usuarios u
                     join roles r on r.id = u.rol_id
                     where r.codigo = 'productor' and u.deleted_at is null and u.is_active) as familias,
                  (select count(*) from cultivos where deleted_at is null) as cultivos,
                  prod.produccion_kg, ventas_agg.ingresos, ventas_agg.venta_kg, auto.autoconsumo_kg
                from prod, ventas_agg, auto
                """
            )
        )
    ).mappings().one()

    # Huella de carbono: reducción estimada por compost, RRSSOO y abono verde
    # aplicados (factores del catálogo factores_carbono).
    co2 = (
        await session.execute(
            text(
                """
                with insumos_kg as (
                  select
                    coalesce(sum(pa.cantidad) filter (where i.nombre ilike '%compost%'), 0) as compost_kg,
                    coalesce(sum(pa.cantidad) filter (where i.nombre ilike '%RRSSOO%'), 0) as rrssoo_kg,
                    coalesce(sum(pa.cantidad) filter (where i.nombre ilike '%abono verde%'), 0) as abono_verde_kg
                  from practicas_agricolas pa
                  join insumos i on i.id = pa.insumo_id
                  where pa.deleted_at is null and pa.cantidad is not null
                )
                select
                  (compost_kg + rrssoo_kg) * coalesce((select valor from factores_carbono where codigo = 'COMPOST_RED'), 0)
                  + abono_verde_kg * coalesce((select valor from factores_carbono where codigo = 'ABONO_VERDE'), 0)
                    as co2_evitado_kg,
                  compost_kg, rrssoo_kg
                from insumos_kg
                """
            )
        )
    ).mappings().one()

    sost = (
        await session.execute(
            text(
                """
                select count(*) as total,
                       count(*) filter (where cp.es_sostenible) as sostenibles,
                       count(*) filter (where cp.sin_agroquimicos) as sin_agroquimicos
                from practicas_agricolas pa
                join tipos_practica tp on tp.id = pa.tipo_id
                join categorias_practica cp on cp.id = tp.categoria_id
                where pa.deleted_at is null
                """
            )
        )
    ).mappings().one()
    total_p = int(sost["total"] or 0)
    pct_sost = round(100 * int(sost["sostenibles"] or 0) / total_p, 1) if total_p else 0.0

    return {
        "biohuertos": int(kpis["biohuertos"] or 0),
        "familias": int(kpis["familias"] or 0),
        "cultivos": int(kpis["cultivos"] or 0),
        "produccion_kg": _num(kpis["produccion_kg"]),
        "ingresos": _num(kpis["ingresos"]),
        "venta_kg": _num(kpis["venta_kg"]),
        "autoconsumo_kg": _num(kpis["autoconsumo_kg"]),
        "co2_evitado_kg": round(_num(co2["co2_evitado_kg"]), 2),
        "compost_kg": _num(co2["compost_kg"]),
        "rrssoo_kg": _num(co2["rrssoo_kg"]),
        "practicas_total": total_p,
        "practicas_sostenibles": int(sost["sostenibles"] or 0),
        "practicas_sin_agroquimicos": int(sost["sin_agroquimicos"] or 0),
        "pct_sostenibilidad": pct_sost,
    }


@router.get("/inversion-biohuerto")
async def reporte_inversion_biohuerto(
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Inversión por biohuerto (hoja "Inversión x BH"): modalidad, área, horas
    dedicadas, personas participantes e inversión monetaria total."""
    result = await session.execute(
        text(
            """
            with horas as (
              select biohuerto_id, sum(horas) as total_horas, count(distinct usuario_id) as personas
              from dedicaciones where deleted_at is null group by biohuerto_id
            ),
            costos as (
              select c.biohuerto_id, sum(co.monto) as inversion
              from costos_produccion co
              join cultivos c on c.id = co.cultivo_id
              where co.deleted_at is null and c.deleted_at is null
              group by c.biohuerto_id
            )
            select b.id::text as biohuerto_id, b.nombre as biohuerto,
                   coalesce(m.nombre, 'Casero') as modalidad, b.area_m2,
                   coalesce(h.total_horas, 0) as total_horas,
                   coalesce(h.personas, 0) as personas,
                   coalesce(cs.inversion, 0) as inversion
            from biohuertos b
            left join modalidades m on m.id = b.modalidad_id
            left join horas h on h.biohuerto_id = b.id
            left join costos cs on cs.biohuerto_id = b.id
            where b.deleted_at is null and b.is_active
            order by b.nombre
            """
        )
    )
    return [
        {
            "biohuerto_id": r["biohuerto_id"],
            "biohuerto": r["biohuerto"],
            "modalidad": r["modalidad"],
            "area_m2": _num(r["area_m2"]),
            "total_horas": _num(r["total_horas"]),
            "personas": int(r["personas"] or 0),
            "inversion": _num(r["inversion"]),
        }
        for r in result.mappings().all()
    ]


@router.get("/inversion-biohuerto/{biohuerto_id}")
async def reporte_inversion_biohuerto_detalle(
    biohuerto_id: str,
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Detalle de inversión de UN biohuerto (hoja "Inversión x BH" del Excel):
    ítems (horas, personas, semilla, agua, insumos, abono, mejorador, otros) con
    unidad, cantidad, costo unitario y costo total."""
    cab = (
        await session.execute(
            text(
                """
                select b.nombre as biohuerto, coalesce(m.nombre, 'Casero') as modalidad, b.area_m2
                from biohuertos b
                left join modalidades m on m.id = b.modalidad_id
                where b.id = :id and b.deleted_at is null
                """
            ),
            {"id": biohuerto_id},
        )
    ).mappings().first()
    if cab is None:
        raise HTTPException(status_code=404, detail="Biohuerto no encontrado")

    hp = (
        await session.execute(
            text(
                """
                select coalesce(sum(horas), 0) as horas, count(distinct usuario_id) as personas
                from dedicaciones where biohuerto_id = :id and deleted_at is null
                """
            ),
            {"id": biohuerto_id},
        )
    ).mappings().one()

    cats = await session.execute(
        text(
            """
            select cc.nombre as categoria,
                   coalesce(sum(co.cantidad), 0) as cantidad,
                   max(un.nombre) as unidad,
                   coalesce(sum(co.monto), 0) as costo_total
            from costos_produccion co
            join cultivos c on c.id = co.cultivo_id
            join categorias_costo cc on cc.id = co.categoria_id
            left join unidades un on un.id = co.unidad_id
            where c.biohuerto_id = :id and co.deleted_at is null and c.deleted_at is null
            group by cc.nombre
            """
        ),
        {"id": biohuerto_id},
    )
    by_cat = {r["categoria"]: r for r in cats.mappings().all()}

    def cat_row(nombre: str) -> dict:
        r = by_cat.get(nombre)
        if r is None:
            return {"item": nombre, "unidad": None, "cantidad": 0.0, "costo_unit": None, "costo_total": 0.0}
        cant = _num(r["cantidad"])
        tot = _num(r["costo_total"])
        return {
            "item": nombre,
            "unidad": r["unidad"],
            "cantidad": cant,
            "costo_unit": round(tot / cant, 2) if cant > 0 else None,
            "costo_total": tot,
        }

    items = [
        {"item": "Horas dedicadas", "unidad": "Hora", "cantidad": _num(hp["horas"]), "costo_unit": None, "costo_total": None},
        {"item": "Personas que participaron", "unidad": "Persona", "cantidad": int(hp["personas"] or 0), "costo_unit": None, "costo_total": None},
        cat_row("Semilla"),
        cat_row("Agua"),
        cat_row("Insumos"),
        cat_row("Abono"),
        cat_row("Mejorador (vitamina)"),
        cat_row("Otros"),
    ]
    return {
        "biohuerto": cab["biohuerto"],
        "modalidad": cab["modalidad"],
        "area_m2": _num(cab["area_m2"]),
        "total_inversion": sum((i["costo_total"] or 0) for i in items),
        "items": items,
    }

