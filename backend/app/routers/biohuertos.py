import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.schemas.biohuertos import BiohuertoCreate, BiohuertoOut, BiohuertoUpdate
from app.schemas.users import CurrentUser
from app.services.attachments import set_principal_image

router = APIRouter(prefix="/api/biohuertos", tags=["biohuertos"])

# Palabras que no aportan a la abreviatura/código del biohuerto.
_CODIGO_STOP = {"de", "del", "la", "las", "los", "el", "y", "en", "biohuerto", "huerto"}


def _abreviatura(nombre: str) -> str:
    """Abreviatura a partir del nombre: iniciales de las palabras significativas.

    'Loma Verde' → 'LV';  'Huerto Chiclayo Norte' → 'CN';  'Esperanza' → 'ESP'.
    """
    norm = unicodedata.normalize("NFKD", nombre or "").encode("ascii", "ignore").decode()
    palabras = [w for w in re.findall(r"[A-Za-z0-9]+", norm) if w.lower() not in _CODIGO_STOP]
    if not palabras:
        palabras = re.findall(r"[A-Za-z0-9]+", norm)
    if not palabras:
        return "BH"
    if len(palabras) == 1:
        return palabras[0][:3].upper()
    return "".join(w[0] for w in palabras[:4]).upper()


async def _codigo_unico(session: AsyncSession, abbr: str, preferido: str | None) -> str:
    """Devuelve un código libre. Respeta el preferido si está disponible;
    si no, usa el prefijo (del preferido o la abreviatura) + siguiente número."""
    if preferido:
        taken = await session.execute(
            text("select 1 from biohuertos where lower(codigo) = lower(:c)"),
            {"c": preferido},
        )
        if taken.first() is None:
            return preferido
        m = re.match(r"^(.*?)-?\d*$", preferido)
        prefix = (m.group(1) if m and m.group(1) else abbr).upper()
    else:
        prefix = abbr
    rows = await session.execute(
        text("select codigo from biohuertos where codigo like :p"), {"p": f"{prefix}-%"}
    )
    usados = {int(mm.group(1)) for (c,) in rows.all() if (mm := re.search(r"-(\d+)$", c or ""))}
    n = 1
    while n in usados:
        n += 1
    return f"{prefix}-{n:03d}"

# ubicacion_referencia se descifra en SQL con pgp_sym_decrypt.
_BIOHUERTO_SELECT = """
    select b.id::text as id, b.codigo, b.abreviatura, b.nombre,
           pgp_sym_decrypt(b.ubicacion_referencia_encrypted, cast(:enc_key as text)) as ubicacion_referencia,
           b.area_m2, b.descripcion,
           b.tipo_area_id, ta.nombre as tipo_area,
           b.latitud, b.longitud, b.estado, b.is_active,
           b.created_at, b.updated_at,
           (select count(*) from cultivos c
             where c.biohuerto_id = b.id and c.deleted_at is null and c.is_active) as cultivos_count,
           (select 'data:' || a.mime_type || ';base64,' || replace(encode(a.datos, 'base64'), E'\n', '')
              from archivos_adjuntos a
             where a.biohuerto_id = b.id and a.es_principal
             order by a.created_at desc limit 1) as imagen
    from biohuertos b
    left join tipos_area ta on ta.id = b.tipo_area_id
"""


def _to_out(row) -> BiohuertoOut:
    return BiohuertoOut.model_validate(dict(row))


async def _ensure_biohuerto_access(session: AsyncSession, biohuerto_id: str, current_user: CurrentUser):
    result = await session.execute(
        text("select is_active from biohuertos where id = :id and deleted_at is null"),
        {"id": biohuerto_id},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Biohuerto no encontrado")
    return row


@router.get("", response_model=list[BiohuertoOut])
async def list_biohuertos(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[BiohuertoOut]:
    params = {"enc_key": get_settings().pgcrypto_key}
    where = "where b.deleted_at is null"
    result = await session.execute(
        text(_BIOHUERTO_SELECT + where + " order by b.created_at desc, b.id desc"),
        params,
    )
    return [_to_out(row) for row in result.mappings().all()]


@router.post("", response_model=BiohuertoOut, status_code=status.HTTP_201_CREATED)
async def create_biohuerto(
    payload: BiohuertoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> BiohuertoOut:
    # Código y abreviatura se derivan del nombre si no vienen; el código se
    # garantiza único (respeta el preferido si está libre, si no, lo numera).
    enc_key = get_settings().pgcrypto_key
    abbr = _abreviatura(payload.nombre)
    abreviatura = (payload.abreviatura or abbr)[:20]
    preferido = payload.codigo.upper() if payload.codigo else None

    insert_sql = text(
        """
        insert into biohuertos
            (tipo_area_id, nombre, codigo, abreviatura,
             ubicacion_referencia_encrypted, latitud, longitud, area_m2,
             descripcion, estado)
        values (
            coalesce(:tipo_area_id, (select id from tipos_area where codigo = 'biohuerto')),
            :nombre, :codigo, :abreviatura,
            case when cast(:ubicacion as text) is null then null
                 else pgp_sym_encrypt(cast(:ubicacion as text), cast(:enc_key as text)) end,
            :latitud, :longitud, :area_m2,
            :descripcion, coalesce(:estado, 'nuevo')
        )
        returning id
        """
    )
    base = {
        "tipo_area_id": payload.tipo_area_id,
        "nombre": payload.nombre,
        "abreviatura": abreviatura,
        "ubicacion": payload.ubicacion_referencia,
        "latitud": payload.latitud,
        "longitud": payload.longitud,
        "area_m2": payload.area_m2,
        "descripcion": payload.descripcion,
        "estado": payload.estado,
        "enc_key": enc_key,
    }

    new_id = None
    for _ in range(5):
        codigo = await _codigo_unico(session, abbr, preferido)
        try:
            result = await session.execute(insert_sql, {**base, "codigo": codigo})
            new_id = str(result.scalar_one())
            await set_principal_image(
                session, column="biohuerto_id", entity_id=new_id, data_url=payload.imagen
            )
            await session.commit()
            break
        except IntegrityError:
            await session.rollback()
            preferido = None  # tras un choque (carrera), pasa a numeración automática
            continue
    if new_id is None:
        raise HTTPException(status_code=500, detail="No se pudo generar un código único")
    return await _get_one(session, new_id)


async def _get_one(session: AsyncSession, biohuerto_id: str) -> BiohuertoOut:
    result = await session.execute(
        text(_BIOHUERTO_SELECT + " where b.id = :id and b.deleted_at is null"),
        {"id": biohuerto_id, "enc_key": get_settings().pgcrypto_key},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Biohuerto no encontrado")
    return _to_out(row)


@router.get("/{biohuerto_id}", response_model=BiohuertoOut)
async def get_biohuerto(
    biohuerto_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BiohuertoOut:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    return await _get_one(session, biohuerto_id)


@router.patch("/{biohuerto_id}", response_model=BiohuertoOut)
async def update_biohuerto(
    biohuerto_id: str,
    payload: BiohuertoUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> BiohuertoOut:
    current = await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _get_one(session, biohuerto_id)
    # Un biohuerto dado de baja (is_active = false) no se puede editar: solo se
    # admite el cambio que lo reactiva (is_active = true).
    if not current["is_active"] and values.get("is_active") is not True:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede editar un biohuerto dado de baja. Reactívalo primero.",
        )

    enc_key = get_settings().pgcrypto_key
    clauses: list[str] = []
    params: dict = {"id": biohuerto_id, "enc_key": enc_key}
    if "nombre" in values:
        params["nombre"] = values["nombre"]
        clauses.append("nombre = :nombre")
    if "codigo" in values:
        duplicate = await session.execute(
            text(
                "select id from biohuertos where lower(codigo) = lower(:codigo) "
                "and id <> :id and deleted_at is null"
            ),
            {"codigo": values["codigo"], "id": biohuerto_id},
        )
        if duplicate.scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El codigo de biohuerto ya existe")
        params["codigo"] = values["codigo"].upper()
        clauses.append("codigo = :codigo")
    if "abreviatura" in values:
        params["abreviatura"] = values["abreviatura"]
        clauses.append("abreviatura = :abreviatura")
    if "ubicacion_referencia" in values:
        params["ubicacion"] = values["ubicacion_referencia"]
        clauses.append(
            "ubicacion_referencia_encrypted = case when cast(:ubicacion as text) is null then null "
            "else pgp_sym_encrypt(cast(:ubicacion as text), cast(:enc_key as text)) end"
        )
    if "latitud" in values:
        params["latitud"] = values["latitud"]
        clauses.append("latitud = :latitud")
    if "longitud" in values:
        params["longitud"] = values["longitud"]
        clauses.append("longitud = :longitud")
    if "area_m2" in values:
        params["area_m2"] = values["area_m2"]
        clauses.append("area_m2 = :area_m2")
    if "descripcion" in values:
        params["descripcion"] = values["descripcion"]
        clauses.append("descripcion = :descripcion")
    if "tipo_area_id" in values:
        params["tipo_area_id"] = values["tipo_area_id"]
        clauses.append("tipo_area_id = :tipo_area_id")
    if "estado" in values:
        params["estado"] = values["estado"]
        clauses.append("estado = :estado")
    if "is_active" in values:
        params["is_active"] = values["is_active"]
        clauses.append("is_active = :is_active")

    if clauses:
        await session.execute(
            text(f"update biohuertos set {', '.join(clauses)} where id = :id and deleted_at is null"),
            params,
        )
    if "imagen" in values:
        await set_principal_image(
            session, column="biohuerto_id", entity_id=biohuerto_id, data_url=values["imagen"]
        )
    await session.commit()
    return await _get_one(session, biohuerto_id)


@router.delete("/{biohuerto_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_biohuerto(
    biohuerto_id: str,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    try:
        await session.execute(
            text("delete from biohuertos where id = :id"),
            {"id": biohuerto_id},
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede eliminar: el biohuerto tiene cultivos u otros registros asociados.",
        ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
