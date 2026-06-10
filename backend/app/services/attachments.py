"""Gestión de la imagen principal (es_principal) de una entidad en archivos_adjuntos.

La imagen llega desde el frontend como data URL (`data:image/png;base64,...`)
o como base64 plano. Se decodifica y se guarda en BYTEA. Se mantiene una sola
imagen principal por entidad: se borra la anterior antes de insertar la nueva.
"""

import base64
import binascii

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Solo se permiten estas columnas FK para evitar inyección en el nombre de columna.
_ALLOWED_COLUMNS = {"biohuerto_id", "cultivo_id", "diagnostico_id"}
_MAX_BYTES = 5 * 1024 * 1024  # 5 MB, coincide con el hint del uploader.


def _parse_image(data_url: str) -> tuple[str, bytes]:
    """Devuelve (mime_type, datos) a partir de un data URL o base64 plano."""
    mime = "image/jpeg"
    b64 = data_url
    if data_url.startswith("data:"):
        header, _, b64 = data_url.partition(",")
        meta = header[len("data:"):]  # p.ej. "image/png;base64"
        if meta:
            mime = meta.split(";", 1)[0] or mime
    if not mime.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="El archivo debe ser una imagen.",
        )
    try:
        raw = base64.b64decode(b64, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imagen inválida.",
        ) from exc
    if len(raw) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="La imagen supera el límite de 5 MB.",
        )
    return mime, raw


async def set_principal_image(
    session: AsyncSession,
    *,
    column: str,
    entity_id,
    data_url: str | None,
) -> None:
    """Reemplaza la imagen principal de la entidad.

    - data_url None o vacío → elimina la imagen actual.
    - data_url con contenido → la sustituye por la nueva.
    No hace commit: el llamador controla la transacción.
    """
    if column not in _ALLOWED_COLUMNS:
        raise ValueError(f"Columna de adjunto no permitida: {column}")

    await session.execute(
        text(f"delete from archivos_adjuntos where {column} = :id and es_principal"),
        {"id": entity_id},
    )
    if not data_url:
        return

    mime, raw = _parse_image(data_url)
    if not raw:
        return

    await session.execute(
        text(
            f"""
            insert into archivos_adjuntos
                ({column}, nombre, mime_type, tamano_bytes, datos, es_principal)
            values (:id, :nombre, :mime, :size, :datos, true)
            """
        ),
        {"id": entity_id, "nombre": "principal", "mime": mime, "size": len(raw), "datos": raw},
    )


def principal_image_subquery(fk_column: str, alias: str) -> str:
    """SQL escalar que arma el data URL de la imagen principal de la entidad."""
    if fk_column not in _ALLOWED_COLUMNS:
        raise ValueError(f"Columna de adjunto no permitida: {fk_column}")
    return (
        "(select 'data:' || a.mime_type || ';base64,' "
        "|| replace(encode(a.datos, 'base64'), E'\\n', '') "
        "from archivos_adjuntos a "
        f"where a.{fk_column} = {alias} and a.es_principal "
        "order by a.created_at desc limit 1) as imagen"
    )
