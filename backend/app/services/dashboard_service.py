from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.dashboard import DashboardOut, SemaforoAmbiental


def _decimal(value) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _semaforo(porcentaje: Decimal) -> SemaforoAmbiental:
    if porcentaje >= Decimal("80"):
        return "verde"
    if porcentaje >= Decimal("50"):
        return "amarillo"
    return "rojo"


async def build_dashboard(session: AsyncSession, biohuerto_id: int) -> DashboardOut:
    summary = await session.execute(
        text(
            """
            select
              count(*) filter (where etapa <> 'finalizado')::int as cultivos_activos,
              count(*) filter (
                where etapa <> 'finalizado'
                  and fecha_estimada_cosecha between current_date and current_date + interval '7 days'
              )::int as proximas_cosechas_7_dias
            from cultivos
            where biohuerto_id = :biohuerto_id
              and deleted_at is null
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    summary_row = summary.mappings().first() or {}

    etapas_result = await session.execute(
        text(
            """
            select etapa::text as etapa, count(*)::int as total
            from cultivos
            where biohuerto_id = :biohuerto_id
              and deleted_at is null
            group by etapa
            order by etapa
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    cultivos_por_etapa = {row["etapa"]: int(row["total"]) for row in etapas_result.mappings().all()}

    alertas_result = await session.execute(
        text(
            """
            select prioridad, count(*)::int as total
            from alertas
            where biohuerto_id = :biohuerto_id
              and estado = 'pendiente'
              and deleted_at is null
            group by prioridad
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    priority_map = {1: "alta", 2: "media", 3: "baja"}
    alertas_pendientes = {"alta": 0, "media": 0, "baja": 0}
    for row in alertas_result.mappings().all():
        alertas_pendientes[priority_map.get(int(row["prioridad"]), "media")] = int(row["total"])

    costos_result = await session.execute(
        text(
            """
            select categoria, coalesce(sum(monto), 0) as total
            from costeo_registros
            where biohuerto_id = :biohuerto_id
              and fecha >= date_trunc('month', current_date)::date
              and fecha < (date_trunc('month', current_date) + interval '1 month')::date
              and deleted_at is null
            group by categoria
            order by categoria
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    costos_mes_por_categoria = {
        row["categoria"]: _decimal(row["total"]) for row in costos_result.mappings().all()
    }
    costos_mes_total = sum(costos_mes_por_categoria.values(), Decimal("0"))

    sostenibilidad = await session.execute(
        text(
            """
            select
              count(*)::int as total,
              count(*) filter (where es_sostenible = true)::int as sostenibles
            from trazabilidad_practicas
            where biohuerto_id = :biohuerto_id
              and fecha_aplicacion >= date_trunc('month', current_date)::date
              and fecha_aplicacion < (date_trunc('month', current_date) + interval '1 month')::date
              and deleted_at is null
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    sostenibilidad_row = sostenibilidad.mappings().first() or {}
    total_practicas = int(sostenibilidad_row.get("total") or 0)
    sostenibles = int(sostenibilidad_row.get("sostenibles") or 0)
    sostenibilidad_porcentaje = (
        (Decimal(sostenibles) * Decimal("100") / Decimal(total_practicas)).quantize(Decimal("0.01"))
        if total_practicas
        else Decimal("0")
    )

    cosechas = await session.execute(
        text(
            """
            select count(*)::int as total
            from cosechas
            where biohuerto_id = :biohuerto_id
              and disponible = true
              and deleted_at is null
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    cosechas_publicadas = int((cosechas.mappings().first() or {}).get("total") or 0)

    carbon = await session.execute(
        text(
            """
            select coalesce(total_kg_co2eq, 0) as total_kg_co2eq
            from carbon_footprint_log
            where biohuerto_id = :biohuerto_id
              and deleted_at is null
            order by periodo_fin desc, created_at desc
            limit 1
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    co2eq_ahorrado_mes = _decimal((carbon.mappings().first() or {}).get("total_kg_co2eq"))

    return DashboardOut(
        biohuerto_id=biohuerto_id,
        cultivos_activos=int(summary_row.get("cultivos_activos") or 0),
        cultivos_por_etapa=cultivos_por_etapa,
        proximas_cosechas_7_dias=int(summary_row.get("proximas_cosechas_7_dias") or 0),
        alertas_pendientes=alertas_pendientes,
        cosechas_publicadas=cosechas_publicadas,
        costos_mes_total=costos_mes_total,
        costos_mes_por_categoria=costos_mes_por_categoria,
        sostenibilidad_porcentaje=sostenibilidad_porcentaje,
        semaforo_ambiental=_semaforo(sostenibilidad_porcentaje),
        co2eq_ahorrado_mes=co2eq_ahorrado_mes,
    )

