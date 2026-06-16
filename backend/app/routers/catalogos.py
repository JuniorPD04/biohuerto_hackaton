"""Catálogos para poblar los selectores del frontend.

Expone lectura de todos los catálogos y, para los extensibles
(especies, unidades, insumos, zonas-planta, tipos-area), permite
"Agregar nuevo" → inserta una fila con es_sistema=false y creado_por_id.
"""
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/catalogos", tags=["catalogos"])

# Catálogos de solo lectura
_READONLY: dict[str, str] = {
    "etapas": "select id, codigo, nombre, orden from etapas_fenologicas order by orden",
    "tipos-incidencia": "select id, nombre from tipos_incidencia order by nombre",
    "tipos-practica": (
        "select tp.id, tp.nombre, tp.categoria_id, cp.nombre as categoria "
        "from tipos_practica tp join categorias_practica cp on cp.id = tp.categoria_id "
        "order by tp.nombre"
    ),
    "categorias-costo": "select id, nombre from categorias_costo order by nombre",
    "tipos-alerta": "select id, nombre from tipos_alerta order by nombre",
    "fuentes-monitoreo": "select id, codigo, nombre from fuentes_monitoreo order by id",
    "roles": "select id, codigo, descripcion from roles order by id",
}

# Catálogos extensibles: (tabla, extra, codigo=tiene columna codigo)
#  especies/insumos/zonas se relacionan solo por id → sin codigo.
#  unidades/tipos_area conservan codigo (el backend usa defaults 'und'/'biohuerto').
_EXTENSIBLE: dict[str, dict] = {
    "especies": {"tabla": "especies", "extra": "nombre_cientifico", "codigo": False},
    "unidades": {"tabla": "unidades", "extra": None, "codigo": True},
    "insumos": {"tabla": "insumos", "extra": None, "codigo": False},
    "zonas-planta": {"tabla": "zonas_planta", "extra": None, "codigo": False},
    "tipos-area": {"tabla": "tipos_area", "extra": None, "codigo": True},
}


def _slug(value: str) -> str:
    norm = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    norm = re.sub(r"[^a-zA-Z0-9]+", "_", norm).strip("_").lower()
    return norm[:40] or "item"


class CatalogoItemCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    codigo: str | None = Field(default=None, max_length=40)
    nombre_cientifico: str | None = Field(default=None, max_length=160)


@router.get("/{catalogo}")
async def list_catalogo(
    catalogo: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    if catalogo in _READONLY:
        query = _READONLY[catalogo]
    elif catalogo in _EXTENSIBLE:
        cfg = _EXTENSIBLE[catalogo]
        cols = "id" + (", codigo" if cfg["codigo"] else "") + ", nombre"
        cols += f", {cfg['extra']}" if cfg["extra"] else ""
        cols += ", es_sistema, is_active"
        query = f"select {cols} from {cfg['tabla']} where is_active order by es_sistema desc, nombre"
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catálogo no encontrado")
    result = await session.execute(text(query))
    return [dict(row._mapping) for row in result]


@router.post("/{catalogo}", status_code=status.HTTP_201_CREATED)
async def create_catalogo_item(
    catalogo: str,
    payload: CatalogoItemCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Agregar nuevo a un catálogo extensible."""
    if catalogo not in _EXTENSIBLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este catálogo no admite agregar elementos",
        )
    cfg = _EXTENSIBLE[catalogo]
    tabla = cfg["tabla"]
    params = {"nombre": payload.nombre.strip(), "creado_por": current_user.id}
    cols = "nombre, es_sistema, creado_por_id"
    vals = ":nombre, false, :creado_por"
    ret = "id"
    if cfg["codigo"]:
        params["codigo"] = (payload.codigo or _slug(payload.nombre)).lower()
        cols = "codigo, " + cols
        vals = ":codigo, " + vals
        ret += ", codigo"
    ret += ", nombre"
    if cfg["extra"] == "nombre_cientifico":
        cols += ", nombre_cientifico"
        vals += ", :nombre_cientifico"
        params["nombre_cientifico"] = payload.nombre_cientifico
        ret += ", nombre_cientifico"
    ret += ", es_sistema, is_active"
    try:
        result = await session.execute(
            text(f"insert into {tabla} ({cols}) values ({vals}) returning {ret}"),
            params,
        )
        row = result.mappings().first()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un elemento con ese nombre o código",
        ) from exc
    return dict(row)
