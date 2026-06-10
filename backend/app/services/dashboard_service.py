from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.dashboard import DashboardOut


async def build_dashboard(session: AsyncSession, biohuerto_id: int) -> DashboardOut:
    total_result = await session.execute(
        text(
            """
            select count(*)::int as total
            from cultivos
            where biohuerto_id = :biohuerto_id
              and deleted_at is null
              and is_active
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    total_cultivos = int((total_result.mappings().first() or {}).get("total") or 0)

    etapas_result = await session.execute(
        text(
            """
            select ef.codigo as etapa, ef.nombre as etapa_nombre, count(*)::int as total
            from cultivos c
            join etapas_fenologicas ef on ef.id = c.etapa_id
            where c.biohuerto_id = :biohuerto_id
              and c.deleted_at is null
              and c.is_active
            group by ef.codigo, ef.nombre, ef.orden
            order by ef.orden
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    cultivos_por_etapa = [dict(row) for row in etapas_result.mappings().all()]

    alertas_result = await session.execute(
        text(
            """
            select count(*)::int as total
            from alertas a
            where a.estado = 'pendiente'
              and a.deleted_at is null
              and (
                a.biohuerto_id = :biohuerto_id
                or a.cultivo_id in (
                    select c.id from cultivos c
                    where c.biohuerto_id = :biohuerto_id
                      and c.deleted_at is null
                )
              )
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    alertas_pendientes = int((alertas_result.mappings().first() or {}).get("total") or 0)

    lecturas_result = await session.execute(
        text(
            """
            select m.registrado_en, m.humedad_pct, m.temperatura_c, m.luminosidad_lux
            from monitoreo_registros m
            join cultivos c on c.id = m.cultivo_id
            where c.biohuerto_id = :biohuerto_id
              and c.deleted_at is null
              and m.deleted_at is null
            order by m.registrado_en desc
            limit 5
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    ultimas_lecturas = [dict(row) for row in lecturas_result.mappings().all()]

    promedios_result = await session.execute(
        text(
            """
            select
              avg(humedad_pct) as promedio_humedad,
              avg(temperatura_c) as promedio_temperatura
            from (
                select m.humedad_pct, m.temperatura_c
                from monitoreo_registros m
                join cultivos c on c.id = m.cultivo_id
                where c.biohuerto_id = :biohuerto_id
                  and c.deleted_at is null
                  and m.deleted_at is null
                order by m.registrado_en desc
                limit 20
            ) recientes
            """
        ),
        {"biohuerto_id": biohuerto_id},
    )
    promedios_row = promedios_result.mappings().first() or {}

    return DashboardOut(
        biohuerto_id=biohuerto_id,
        total_cultivos=total_cultivos,
        cultivos_por_etapa=cultivos_por_etapa,
        alertas_pendientes=alertas_pendientes,
        ultimas_lecturas=ultimas_lecturas,
        promedio_humedad=promedios_row.get("promedio_humedad"),
        promedio_temperatura=promedios_row.get("promedio_temperatura"),
    )
