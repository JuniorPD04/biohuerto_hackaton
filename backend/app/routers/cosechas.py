from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.cosechas import CosechaCreate, CosechaOut, CosechaUpdate
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/cosechas", tags=["cosechas"])

# telefono se descifra en SQL con pgp_sym_decrypt.
_COSECHA_SELECT = """
    select co.id::text, co.cultivo_id::text, e.nombre as cultivo, co.usuario_id,
           u.nombre as productor,
           pgp_sym_decrypt(u.telefono_encrypted, cast(:enc_key as text)) as productor_telefono,
           co.nombre_producto, co.cantidad, co.unidad_id, un.codigo as unidad,
           co.precio_referencial, co.fecha_cosecha, co.link_whatsapp,
           pgp_sym_decrypt(co.telefono_encrypted, cast(:enc_key as text)) as telefono,
           co.estado, co.published_at, co.created_at, co.updated_at,
           (select 'data:' || a.mime_type || ';base64,' || replace(encode(a.datos, 'base64'), E'\n', '')
              from archivos_adjuntos a
             where a.cultivo_id = co.cultivo_id and a.es_principal
             order by a.created_at desc limit 1) as cultivo_imagen
    from cosechas co
    left join cultivos c on c.id = co.cultivo_id
    left join especies e on e.id = c.especie_id
    left join unidades un on un.id = co.unidad_id
    left join usuarios u on u.id = co.usuario_id
"""


def _to_out(row) -> CosechaOut:
    return CosechaOut.model_validate(dict(row))


async def _get_one(session: AsyncSession, cosecha_id: UUID) -> CosechaOut:
    result = await session.execute(
        text(_COSECHA_SELECT + " where co.id = :id and co.deleted_at is null"),
        {"id": cosecha_id, "enc_key": get_settings().pgcrypto_key},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cosecha no encontrada")
    return _to_out(row)


async def _ensure_cosecha_access(session: AsyncSession, cosecha_id: UUID, current_user: CurrentUser):
    result = await session.execute(
        text("select usuario_id, published_at from cosechas where id = :id and deleted_at is null"),
        {"id": cosecha_id},
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cosecha no encontrada")
    if current_user.rol != "admin" and row["usuario_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes acceder a esta cosecha")
    return row


@router.get("", response_model=list[CosechaOut])
async def list_cosechas(
    estado: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CosechaOut]:
    params: dict = {"enc_key": get_settings().pgcrypto_key}
    filters = ["co.deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("co.usuario_id = :usuario_id")
        params["usuario_id"] = current_user.id
    if estado is not None:
        filters.append("co.estado = :estado")
        params["estado"] = estado

    result = await session.execute(
        text(
            _COSECHA_SELECT
            + " where "
            + " and ".join(filters)
            + " order by co.fecha_cosecha desc, co.created_at desc"
        ),
        params,
    )
    return [_to_out(row) for row in result.mappings().all()]


@router.get("/public", response_model=list[CosechaOut])
async def list_public_cosechas(
    session: AsyncSession = Depends(get_session),
) -> list[CosechaOut]:
    result = await session.execute(
        text(
            _COSECHA_SELECT
            + """
            where co.deleted_at is null
              and co.estado = 'publicado'
            order by co.published_at desc nulls last, co.fecha_cosecha desc, co.created_at desc
            """
        ),
        {"enc_key": get_settings().pgcrypto_key},
    )
    return [_to_out(row) for row in result.mappings().all()]


@router.post("", response_model=CosechaOut, status_code=status.HTTP_201_CREATED)
async def create_cosecha(
    payload: CosechaCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CosechaOut:
    if payload.cultivo_id is not None:
        await _ensure_cultivo_access(session, payload.cultivo_id, current_user)

    productor_id = current_user.id
    if payload.usuario_id is not None and payload.usuario_id != current_user.id:
        if current_user.rol != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo un administrador puede registrar la cosecha de otro productor",
            )
        productor = await session.execute(
            text(
                """
                select u.id from usuarios u
                join roles r on r.id = u.rol_id
                where u.id = :id and u.deleted_at is null and u.is_active = true and r.codigo = 'productor'
                """
            ),
            {"id": payload.usuario_id},
        )
        if productor.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Productor no encontrado o inactivo")
        productor_id = payload.usuario_id

    enc_key = get_settings().pgcrypto_key
    result = await session.execute(
        text(
            """
            insert into cosechas (
              cultivo_id, usuario_id, nombre_producto, cantidad, unidad_id,
              precio_referencial, fecha_cosecha, link_whatsapp,
              telefono_encrypted, estado, published_at
            )
            values (
              :cultivo_id, :usuario_id, :nombre_producto, :cantidad,
              coalesce(:unidad_id, (select id from unidades where codigo = 'kg')),
              :precio_referencial, :fecha_cosecha, :link_whatsapp,
              case when cast(:telefono as text) is null then null
                   else pgp_sym_encrypt(cast(:telefono as text), cast(:enc_key as text)) end,
              cast(:estado as text),
              case when cast(:estado as text) = 'publicado' then now() else null end
            )
            returning id
            """
        ),
        {
            "cultivo_id": payload.cultivo_id,
            "usuario_id": productor_id,
            "nombre_producto": payload.nombre_producto,
            "cantidad": payload.cantidad,
            "unidad_id": payload.unidad_id,
            "precio_referencial": payload.precio_referencial,
            "fecha_cosecha": payload.fecha_cosecha,
            "link_whatsapp": payload.link_whatsapp,
            "telefono": payload.telefono,
            "estado": payload.estado,
            "enc_key": enc_key,
        },
    )
    new_id = result.scalar_one()
    await session.commit()
    return await _get_one(session, new_id)


@router.get("/{cosecha_id}", response_model=CosechaOut)
async def get_cosecha(
    cosecha_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CosechaOut:
    await _ensure_cosecha_access(session, cosecha_id, current_user)
    return await _get_one(session, cosecha_id)


@router.patch("/{cosecha_id}", response_model=CosechaOut)
async def update_cosecha(
    cosecha_id: UUID,
    payload: CosechaUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CosechaOut:
    existing = await _ensure_cosecha_access(session, cosecha_id, current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _get_one(session, cosecha_id)

    enc_key = get_settings().pgcrypto_key
    clauses: list[str] = []
    params: dict = {"id": cosecha_id, "enc_key": enc_key}
    simple_fields = {
        "nombre_producto",
        "cantidad",
        "unidad_id",
        "precio_referencial",
        "fecha_cosecha",
        "link_whatsapp",
        "estado",
    }
    for field in simple_fields:
        if field in values:
            params[field] = values[field]
            clauses.append(f"{field} = :{field}")
    if "telefono" in values:
        params["telefono"] = values["telefono"]
        clauses.append(
            "telefono_encrypted = case when cast(:telefono as text) is null then null "
            "else pgp_sym_encrypt(cast(:telefono as text), cast(:enc_key as text)) end"
        )
    if values.get("estado") == "publicado" and existing["published_at"] is None:
        clauses.append("published_at = now()")

    await session.execute(
        text(f"update cosechas set {', '.join(clauses)} where id = :id and deleted_at is null"),
        params,
    )
    await session.commit()
    return await _get_one(session, cosecha_id)


@router.delete("/{cosecha_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cosecha(
    cosecha_id: UUID,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _ensure_cosecha_access(session, cosecha_id, current_user)
    await session.execute(
        text("update cosechas set deleted_at = now() where id = :id and deleted_at is null"),
        {"id": cosecha_id},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
