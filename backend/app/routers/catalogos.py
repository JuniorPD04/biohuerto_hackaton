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
    "roles": "select id, codigo, descripcion from roles order by id",
}

# Catálogos extensibles: (tabla, columnas_extra_para_select)
_EXTENSIBLE: dict[str, dict] = {
    "especies": {"tabla": "especies", "extra": "nombre_cientifico"},
    "unidades": {"tabla": "unidades", "extra": None},
    "insumos": {"tabla": "insumos", "extra": None},
    "zonas-planta": {"tabla": "zonas_planta", "extra": None},
    "tipos-area": {"tabla": "tipos_area", "extra": None},
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
        extra = f", {cfg['extra']}" if cfg["extra"] else ""
        query = (
            f"select id, codigo, nombre{extra}, es_sistema, activo "
            f"from {cfg['tabla']} where activo order by es_sistema desc, nombre"
        )
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
    codigo = (payload.codigo or _slug(payload.nombre)).lower()
    params = {
        "codigo": codigo,
        "nombre": payload.nombre.strip(),
        "creado_por": current_user.id,
    }
    cols = "codigo, nombre, es_sistema, creado_por_id"
    vals = ":codigo, :nombre, false, :creado_por"
    extra_sel = ""
    if cfg["extra"] == "nombre_cientifico":
        cols += ", nombre_cientifico"
        vals += ", :nombre_cientifico"
        params["nombre_cientifico"] = payload.nombre_cientifico
        extra_sel = ", nombre_cientifico"
    try:
        result = await session.execute(
            text(
                f"insert into {tabla} ({cols}) values ({vals}) "
                f"returning id, codigo, nombre{extra_sel}, es_sistema, activo"
            ),
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
