"""Administración de entidades fuente (catálogos maestros).

Alimenta la pantalla "Entidades": rail de catálogos + CRUD por catálogo
(listar, crear, editar, dar de baja / reactivar, eliminar).

El conjunto de catálogos y sus columnas se declara en CONFIG (server-side):
los nombres de tabla/columna NUNCA vienen del cliente, así que construir el
SQL a partir de esa config es seguro; los valores van siempre parametrizados.
"""
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import require_role
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/entidades", tags=["entidades"])

# key → configuración del catálogo.
#   cols      : columnas a leer (o usar list_sql para joins)
#   order     : ORDER BY
#   crear     : columnas insertables desde el form
#   editar    : columnas modificables (codigo "constante" queda fuera)
#   is_active : el catálogo soporta dar de baja / reactivar
#   es_sistema: catálogo extensible (inserta es_sistema=false + creado_por_id)
CONFIG: dict[str, dict[str, Any]] = {
    "etapas": {
        "tabla": "etapas_fenologicas", "label": "Etapas fenológicas", "icon": "seedling",
        "descripcion": "Fases del ciclo de vida de un cultivo, con sus colores de etiqueta.",
        "cols": "id, codigo, nombre, orden, color_bg, color_fg", "order": "orden",
        "crear": ["codigo", "nombre", "orden", "color_bg", "color_fg"],
        "editar": ["nombre", "orden", "color_bg", "color_fg"],
        "is_active": False, "es_sistema": False,
    },
    "especies": {
        "tabla": "especies", "label": "Especies", "icon": "leaf",
        "descripcion": "Especies cultivables; base de la fenología por especie.",
        "cols": "id, nombre, nombre_cientifico, es_sistema, is_active",
        "order": "es_sistema desc, nombre",
        "crear": ["nombre", "nombre_cientifico"], "editar": ["nombre", "nombre_cientifico"],
        "is_active": True, "es_sistema": True,
    },
    "tipos-incidencia": {
        "tabla": "tipos_incidencia", "label": "Tipos de incidencia", "icon": "alertTri",
        "descripcion": "Clasificación de los problemas registrados en campo.",
        "cols": "id, nombre", "order": "nombre",
        "crear": ["nombre"], "editar": ["nombre"], "is_active": False, "es_sistema": False,
    },
    "categorias-practica": {
        "tabla": "categorias_practica", "label": "Categorías de práctica", "icon": "recycle",
        "descripcion": "Familias de prácticas agrícolas sostenibles.",
        "cols": "id, nombre, es_sostenible, sin_agroquimicos", "order": "nombre",
        "crear": ["nombre", "es_sostenible", "sin_agroquimicos"],
        "editar": ["nombre", "es_sostenible", "sin_agroquimicos"],
        "is_active": False, "es_sistema": False,
    },
    "tipos-practica": {
        "tabla": "tipos_practica", "label": "Tipos de práctica", "icon": "sliders",
        "descripcion": "Prácticas concretas dentro de cada categoría.",
        "list_sql": (
            "select tp.id, tp.categoria_id, tp.nombre, cp.nombre as categoria "
            "from tipos_practica tp join categorias_practica cp on cp.id = tp.categoria_id "
            "order by cp.nombre, tp.nombre"
        ),
        "crear": ["categoria_id", "nombre"], "editar": ["categoria_id", "nombre"],
        "is_active": False, "es_sistema": False,
    },
    "categorias-costo": {
        "tabla": "categorias_costo", "label": "Categorías de costo", "icon": "coins",
        "descripcion": "Rubros para clasificar los costos de producción.",
        "cols": "id, nombre", "order": "nombre",
        "crear": ["nombre"], "editar": ["nombre"], "is_active": False, "es_sistema": False,
    },
    "tipos-alerta": {
        "tabla": "tipos_alerta", "label": "Tipos de alerta", "icon": "bell",
        "descripcion": "Naturaleza de las alertas y cuidados programados.",
        "cols": "id, nombre", "order": "nombre",
        "crear": ["nombre"], "editar": ["nombre"], "is_active": False, "es_sistema": False,
    },
    "unidades": {
        "tabla": "unidades", "label": "Unidades de medida", "icon": "ruler",
        "descripcion": "Unidades para cantidades, cosechas e insumos.",
        "cols": "id, codigo, nombre, es_sistema, is_active", "order": "es_sistema desc, nombre",
        "crear": ["codigo", "nombre"], "editar": ["codigo", "nombre"],
        "is_active": True, "es_sistema": True,
    },
    "insumos": {
        "tabla": "insumos", "label": "Insumos", "icon": "flask",
        "descripcion": "Materiales y productos usados en el biohuerto.",
        "cols": "id, nombre, es_sistema, is_active", "order": "es_sistema desc, nombre",
        "crear": ["nombre"], "editar": ["nombre"], "is_active": True, "es_sistema": True,
    },
    "zonas-planta": {
        "tabla": "zonas_planta", "label": "Zonas de la planta", "icon": "plant",
        "descripcion": "Partes de la planta afectadas por una incidencia.",
        "cols": "id, nombre, es_sistema, is_active", "order": "es_sistema desc, nombre",
        "crear": ["nombre"], "editar": ["nombre"], "is_active": True, "es_sistema": True,
    },
    "tipos-area": {
        "tabla": "tipos_area", "label": "Tipos de área", "icon": "box",
        "descripcion": "Tipos de área de sembrío (biohuerto, parcela, …).",
        "cols": "id, codigo, nombre, es_sistema, is_active", "order": "es_sistema desc, nombre",
        "crear": ["codigo", "nombre"], "editar": ["codigo", "nombre"],
        "is_active": True, "es_sistema": True,
    },
    "fuentes-monitoreo": {
        "tabla": "fuentes_monitoreo", "label": "Fuentes de monitoreo", "icon": "wifi",
        "descripcion": "Origen del registro de monitoreo (IoT / Manual).",
        "cols": "id, codigo, nombre", "order": "id",
        "crear": ["codigo", "nombre"], "editar": ["nombre"],  # codigo es constante de código
        "is_active": False, "es_sistema": False,
    },
    "factores-carbono": {
        "tabla": "factores_carbono", "label": "Factores de carbono", "icon": "activity",
        "descripcion": "Factores de emisión / reducción para la huella de carbono.",
        "cols": "id, codigo, descripcion, valor, unidad, fuente, vigente_desde, vigente_hasta",
        "order": "codigo",
        "crear": ["codigo", "descripcion", "valor", "unidad", "fuente"],
        "editar": ["descripcion", "valor", "unidad", "fuente"],  # codigo es constante de código
        "is_active": False, "es_sistema": False,
    },
}


def _cfg(key: str) -> dict:
    cfg = CONFIG.get(key)
    if cfg is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entidad no encontrada")
    return cfg


def _list_sql(cfg: dict) -> str:
    if "list_sql" in cfg:
        return cfg["list_sql"]
    return f"select {cfg['cols']} from {cfg['tabla']} order by {cfg['order']}"


async def _get_one(session: AsyncSession, cfg: dict, item_id: int) -> dict:
    row = (
        await session.execute(
            text(f"select * from ({_list_sql(cfg)}) t where t.id = :id"), {"id": item_id}
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    return dict(row)


@router.get("")
async def list_entidades(
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    """Rail de entidades con su nº de registros."""
    out = []
    for key, cfg in CONFIG.items():
        count = (await session.execute(text(f"select count(*) from {cfg['tabla']}"))).scalar_one()
        out.append({
            "key": key, "label": cfg["label"], "icon": cfg["icon"],
            "descripcion": cfg["descripcion"], "is_active": cfg["is_active"],
            "es_sistema": cfg["es_sistema"], "count": count,
        })
    return out


@router.get("/{key}")
async def list_items(
    key: str,
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    cfg = _cfg(key)
    rows = (await session.execute(text(_list_sql(cfg)))).mappings().all()
    return [dict(r) for r in rows]


@router.post("/{key}", status_code=status.HTTP_201_CREATED)
async def create_item(
    key: str,
    payload: dict = Body(...),
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    cfg = _cfg(key)
    data = {c: payload[c] for c in cfg["crear"] if c in payload and payload[c] != ""}
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Faltan datos")
    cols = list(data.keys())
    if cfg["es_sistema"]:
        data["es_sistema"] = False
        data["creado_por_id"] = current_user.id
        cols += ["es_sistema", "creado_por_id"]
    placeholders = ", ".join(f":{c}" for c in cols)
    try:
        new_id = (
            await session.execute(
                text(f"insert into {cfg['tabla']} ({', '.join(cols)}) values ({placeholders}) returning id"),
                data,
            )
        ).scalar_one()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un registro con esos valores únicos.",
        ) from exc
    return await _get_one(session, cfg, new_id)


@router.patch("/{key}/{item_id}")
async def update_item(
    key: str,
    item_id: int,
    payload: dict = Body(...),
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict:
    cfg = _cfg(key)
    data = {c: payload[c] for c in cfg["editar"] if c in payload}
    if cfg["is_active"] and "is_active" in payload:
        data["is_active"] = bool(payload["is_active"])
    if not data:
        return await _get_one(session, cfg, item_id)
    sets = ", ".join(f"{c} = :{c}" for c in data)
    data["id"] = item_id
    try:
        res = await session.execute(
            text(f"update {cfg['tabla']} set {sets} where id = :id"), data
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un registro con esos valores únicos.",
        ) from exc
    if res.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    return await _get_one(session, cfg, item_id)


@router.delete("/{key}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    key: str,
    item_id: int,
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    cfg = _cfg(key)
    try:
        res = await session.execute(
            text(f"delete from {cfg['tabla']} where id = :id"), {"id": item_id}
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar: el registro está en uso. Da de baja en su lugar."
            if cfg["is_active"]
            else "No se puede eliminar: el registro está en uso.",
        ) from exc
    if res.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
