from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user
from app.routers.biohuertos import _ensure_biohuerto_access
from app.schemas.dashboard import DashboardOut, PanelOut
from app.schemas.users import CurrentUser
from app.services.dashboard_service import build_dashboard

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _f(value) -> float:
    return float(value) if value is not None else 0.0


@router.get("/overview", response_model=PanelOut)
async def panel_overview(
    dias: int = Query(default=30, ge=1, le=365),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PanelOut:
    """Resumen global del panel: próximas cosechas, alertas, etapas, costos,
    sostenibilidad y huella ambiental. Admin ve todo; otros ven lo suyo."""
    mine = current_user.rol != "admin"
    uid = {"uid": current_user.id} if mine else {}
    # Filtro de alcance por usuario reutilizable.
    cultivo_scope = (
        "and cultivo_id in (select id from cultivos where deleted_at is null and usuario_id = :uid)"
        if mine
        else ""
    )

    # --- Próximas cosechas (dentro de la ventana) ---
    cosechas = await session.execute(
        text(
            f"""
            select c.id::text as cultivo_id, e.nombre as especie, b.nombre as biohuerto,
                   c.fecha_estimada_cosecha,
                   (c.fecha_estimada_cosecha - current_date) as dias
            from cultivos c
            join etapas_fenologicas ef on ef.id = c.etapa_id
            join especies e on e.id = c.especie_id
            left join biohuertos b on b.id = c.biohuerto_id
            where c.deleted_at is null and c.is_active
              and ef.codigo <> 'finalizado'
              and c.fecha_estimada_cosecha is not null
              and c.fecha_estimada_cosecha >= current_date
              and c.fecha_estimada_cosecha <= current_date + make_interval(days => :dias)
              {"and c.usuario_id = :uid" if mine else ""}
            order by c.fecha_estimada_cosecha asc
            """
        ),
        {"dias": dias, **uid},
    )
    cosechas_rows = [dict(r) for r in cosechas.mappings().all()]
    for r in cosechas_rows:
        r["fecha_estimada_cosecha"] = r["fecha_estimada_cosecha"].isoformat()
        r["dias"] = int(r["dias"])

    # --- Alertas pendientes por prioridad ---
    alertas = await session.execute(
        text(
            f"""
            select prioridad, count(*) as n
            from alertas
            where estado = 'pendiente' and deleted_at is null
              {"and usuario_id = :uid" if mine else ""}
            group by prioridad
            """
        ),
        uid,
    )
    pr = {1: 0, 2: 0, 3: 0}
    for row in alertas.mappings().all():
        pr[int(row["prioridad"])] = int(row["n"])
    alertas_pendientes = {"alta": pr[3], "media": pr[2], "baja": pr[1], "total": pr[1] + pr[2] + pr[3]}

    # --- Cultivos por etapa (activos, excl. finalizado) ---
    etapas = await session.execute(
        text(
            f"""
            select ef.codigo as etapa, ef.nombre as etapa_nombre, ef.orden,
                   count(c.id) as total
            from etapas_fenologicas ef
            left join cultivos c
              on c.etapa_id = ef.id and c.deleted_at is null and c.is_active
              {"and c.usuario_id = :uid" if mine else ""}
            where ef.codigo <> 'finalizado'
            group by ef.codigo, ef.nombre, ef.orden
            order by ef.orden
            """
        ),
        uid,
    )
    etapas_rows = [{"etapa": r["etapa"], "etapa_nombre": r["etapa_nombre"], "total": int(r["total"])} for r in etapas.mappings().all()]
    total_cultivos_activos = sum(e["total"] for e in etapas_rows)

    # --- Costos por categoría ---
    costos = await session.execute(
        text(
            f"""
            select cc.nombre as categoria, coalesce(sum(cp.monto), 0) as monto
            from categorias_costo cc
            left join costos_produccion cp
              on cp.categoria_id = cc.id and cp.deleted_at is null
              {cultivo_scope.replace("cultivo_id", "cp.cultivo_id")}
            group by cc.nombre
            order by monto desc
            """
        ),
        uid,
    )
    costos_rows = [{"categoria": r["categoria"], "monto": _f(r["monto"])} for r in costos.mappings().all()]
    costo_total = sum(c["monto"] for c in costos_rows)
    costo_agua = next((c["monto"] for c in costos_rows if c["categoria"] == "Agua"), 0.0)

    # --- Sostenibilidad ---
    sost = await session.execute(
        text(
            f"""
            select count(*) as total,
                   count(*) filter (where cp.es_sostenible) as sostenibles
            from practicas_agricolas p
            join tipos_practica tp on tp.id = p.tipo_id
            join categorias_practica cp on cp.id = tp.categoria_id
            where p.deleted_at is null
              {cultivo_scope.replace("cultivo_id", "p.cultivo_id")}
            """
        ),
        uid,
    )
    srow = sost.mappings().first()
    s_total = int(srow["total"] or 0)
    s_sost = int(srow["sostenibles"] or 0)
    sostenibilidad = {
        "sostenibles": s_sost,
        "total": s_total,
        "score": round((s_sost / s_total) * 100) if s_total else 0,
    }

    # --- Huella de carbono y compost ---
    huella = await session.execute(
        text(
            f"""
            with hagg as (
              select h.id, h.huella_neta_kg_co2,
                     coalesce(sum(hc.cantidad) filter (where hc.tipo = 'compost'), 0) as compost
              from huella_carbono h
              left join huella_componentes hc on hc.huella_id = h.id
              where true
                {cultivo_scope.replace("cultivo_id", "h.cultivo_id")}
              group by h.id, h.huella_neta_kg_co2
            )
            select coalesce(sum(huella_neta_kg_co2), 0) as huella,
                   coalesce(sum(compost), 0) as compost
            from hagg
            """
        ),
        uid,
    )
    hrow = huella.mappings().first()

    # --- Semáforo ambiental por práctica, desglosado por cultivo ---
    #  Datos reales de huella_carbono agregados por cultivo (un cultivo puede
    #  tener varios periodos). El frontend arma las 4 prácticas y su semáforo.
    sem_huella = await session.execute(
        text(
            f"""
            with hagg as (
              select h.id, h.cultivo_id, h.huella_neta_kg_co2,
                     coalesce(sum(hc.cantidad) filter (where hc.tipo = 'agua'), 0) as agua,
                     coalesce(sum(hc.cantidad) filter (where hc.tipo in ('compost','abono_verde')), 0) as compost,
                     coalesce(sum(hc.cantidad) filter (where hc.tipo = 'sin_agroquim'), 0) as area,
                     coalesce(sum(hc.cantidad) filter (where hc.tipo = 'ctrl_bio'), 0) as ctrl_bio
              from huella_carbono h
              left join huella_componentes hc on hc.huella_id = h.id
              group by h.id, h.cultivo_id, h.huella_neta_kg_co2
            )
            select c.id::text as cultivo_id, e.nombre as especie, b.nombre as biohuerto,
                   coalesce(sum(ha.compost), 0) as compost_kg,
                   coalesce(sum(ha.agua), 0) as agua_m3,
                   coalesce(sum(ha.area), 0) as area_m2,
                   coalesce(sum(ha.ctrl_bio), 0) as aplic_ctrl_bio,
                   coalesce(sum(ha.huella_neta_kg_co2), 0) as huella
            from cultivos c
            join hagg ha on ha.cultivo_id = c.id
            join especies e on e.id = c.especie_id
            left join biohuertos b on b.id = c.biohuerto_id
            where c.deleted_at is null
              {"and c.usuario_id = :uid" if mine else ""}
            group by c.id, e.nombre, b.nombre
            order by e.nombre
            """
        ),
        uid,
    )
    # Nº de aplicaciones de compost y control biológico por cultivo (de prácticas).
    sem_practicas = await session.execute(
        text(
            f"""
            select p.cultivo_id::text as cultivo_id,
                   count(*) filter (
                     where tp.nombre in ('Compost / Abono orgánico', 'Abono verde')
                   ) as n_compost,
                   count(*) filter (where cp.nombre = 'Biológica') as n_control_bio
            from practicas_agricolas p
            join tipos_practica tp on tp.id = p.tipo_id
            join categorias_practica cp on cp.id = tp.categoria_id
            where p.deleted_at is null
              {cultivo_scope.replace("cultivo_id", "p.cultivo_id")}
            group by p.cultivo_id
            """
        ),
        uid,
    )
    practicas_por_cultivo = {
        r["cultivo_id"]: r for r in sem_practicas.mappings().all()
    }
    semaforo_ambiental = []
    for r in sem_huella.mappings().all():
        pr = practicas_por_cultivo.get(r["cultivo_id"], {})
        semaforo_ambiental.append(
            {
                "cultivo_id": r["cultivo_id"],
                "especie": r["especie"],
                "biohuerto": r["biohuerto"],
                "compost_kg": _f(r["compost_kg"]),
                "n_compost": int(pr.get("n_compost") or 0),
                "agua_m3": _f(r["agua_m3"]),
                "area_m2": _f(r["area_m2"]),
                "aplicaciones_control_bio": int(r["aplic_ctrl_bio"] or 0),
                "n_control_bio": int(pr.get("n_control_bio") or 0),
                "huella_neta_kg_co2": _f(r["huella"]),
            }
        )

    return PanelOut(
        horizonte_dias=dias,
        proximas_cosechas=cosechas_rows[:5],
        total_proximas=len(cosechas_rows),
        alertas_pendientes=alertas_pendientes,
        cultivos_por_etapa=etapas_rows,
        total_cultivos_activos=total_cultivos_activos,
        costos=costos_rows,
        costo_total=costo_total,
        costo_agua=costo_agua,
        sostenibilidad=sostenibilidad,
        huella_total_kg_co2=_f(hrow["huella"]),
        compost_kg=_f(hrow["compost"]),
        semaforo_ambiental=semaforo_ambiental,
    )


@router.get("/{biohuerto_id}", response_model=DashboardOut)
async def get_dashboard(
    biohuerto_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DashboardOut:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    return await build_dashboard(session, biohuerto_id)
