from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.schemas.cultivos import CultivoCreate, CultivoHistorial, CultivoOut, CultivoUpdate
from app.schemas.users import CurrentUser
from app.services.attachments import set_principal_image

router = APIRouter(prefix="/api/cultivos", tags=["cultivos"])

_CULTIVO_SELECT = """
    select c.id, c.biohuerto_id, b.nombre as biohuerto_nombre, c.usuario_id,
           c.especie, c.variedad, ef.codigo as etapa, ef.nombre as etapa_nombre,
           c.fecha_siembra, c.fecha_estimada_cosecha, c.cantidad, c.unidad_cantidad,
           c.area_m2, cmp.nombre as campania, c.notas, c.is_active,
           (select 'data:' || a.mime_type || ';base64,' || replace(encode(a.datos, 'base64'), E'\n', '')
              from archivos_adjuntos a
             where a.cultivo_id = c.id and a.es_principal
             order by a.created_at desc limit 1) as imagen,
           c.created_at, c.updated_at
    from cultivos c
    join etapas_fenologicas ef on ef.id = c.etapa_id
    left join biohuertos b on b.id = c.biohuerto_id
    left join campanias cmp on cmp.id = c.campania_id
"""


def _to_cultivo_out(row) -> CultivoOut:
    return CultivoOut.model_validate(dict(row))


async def _fetch_cultivo_row(session: AsyncSession, cultivo_id: UUID):
    result = await session.execute(
        text(_CULTIVO_SELECT + " where c.id = :id and c.deleted_at is null"),
        {"id": cultivo_id},
    )
    return result.mappings().first()


async def _ensure_cultivo_access(session: AsyncSession, cultivo_id: UUID, current_user: CurrentUser):
    row = await _fetch_cultivo_row(session, cultivo_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cultivo no encontrado")
    if current_user.rol != "admin" and row["usuario_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes acceder a este cultivo")
    return row


async def _ensure_cosecha_for_cultivo(session: AsyncSession, cultivo_id: UUID) -> None:
    """Al pasar un cultivo a etapa 'cosecha', lo agrega a Gestión de Cosechas.

    Crea una cosecha 'disponible' asociada al cultivo y su productor, sin duplicar
    si ya existe una para ese cultivo. El precio queda en 0 para que el productor
    lo complete luego. No hace commit: el llamador controla la transacción.
    """
    row = await _fetch_cultivo_row(session, cultivo_id)
    if row is None or row["usuario_id"] is None:
        return

    existing = await session.execute(
        text("select 1 from cosechas where cultivo_id = :id and deleted_at is null limit 1"),
        {"id": cultivo_id},
    )
    if existing.first() is not None:
        return

    nombre = " ".join(p for p in [row["especie"], row["variedad"]] if p) or row["especie"]
    await session.execute(
        text(
            """
            insert into cosechas
                (cultivo_id, usuario_id, nombre_producto, cantidad, unidad,
                 precio_referencial, fecha_cosecha, estado)
            values
                (:cultivo_id, :usuario_id, :nombre, :cantidad, :unidad,
                 0, coalesce(:fecha, current_date), 'disponible')
            """
        ),
        {
            "cultivo_id": cultivo_id,
            "usuario_id": row["usuario_id"],
            "nombre": nombre,
            "cantidad": row["cantidad"] if row["cantidad"] is not None else 0,
            "unidad": row["unidad_cantidad"] or "kg",
            "fecha": row["fecha_estimada_cosecha"],
        },
    )


@router.get("", response_model=list[CultivoOut])
async def list_cultivos(
    biohuerto_id: int | None = None,
    etapa: str | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CultivoOut]:
    params: dict = {}
    filters = ["c.deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("c.usuario_id = :usuario_id")
        params["usuario_id"] = current_user.id
    if biohuerto_id is not None:
        filters.append("c.biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id
    if etapa is not None:
        filters.append("ef.codigo = :etapa")
        params["etapa"] = etapa

    result = await session.execute(
        text(_CULTIVO_SELECT + " where " + " and ".join(filters) + " order by c.created_at desc"),
        params,
    )
    return [_to_cultivo_out(row) for row in result.mappings().all()]


@router.post("", response_model=CultivoOut, status_code=status.HTTP_201_CREATED)
async def create_cultivo(
    payload: CultivoCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CultivoOut:
    await _ensure_biohuerto_access(session, payload.biohuerto_id, current_user)
    result = await session.execute(
        text(
            """
            insert into cultivos (
              biohuerto_id, usuario_id, etapa_id, campania_id, especie, variedad,
              fecha_siembra, fecha_estimada_cosecha, cantidad, unidad_cantidad, area_m2, notas
            )
            values (
              :biohuerto_id, :usuario_id,
              (select id from etapas_fenologicas where codigo = :etapa),
              (select id from campanias where nombre = :campania),
              :especie, :variedad, :fecha_siembra, :fecha_estimada_cosecha,
              :cantidad, :unidad_cantidad, :area_m2, :notas
            )
            returning id
            """
        ),
        {
            "biohuerto_id": payload.biohuerto_id,
            "usuario_id": current_user.id,
            "etapa": payload.etapa,
            "campania": payload.campania,
            "especie": payload.especie,
            "variedad": payload.variedad,
            "fecha_siembra": payload.fecha_siembra,
            "fecha_estimada_cosecha": payload.fecha_estimada_cosecha,
            "cantidad": payload.cantidad,
            "unidad_cantidad": payload.unidad_cantidad,
            "area_m2": payload.area_m2,
            "notas": payload.notas,
        },
    )
    new_id = result.scalar_one()
    await set_principal_image(session, column="cultivo_id", entity_id=new_id, data_url=payload.imagen)
    if payload.etapa == "cosecha":
        await _ensure_cosecha_for_cultivo(session, new_id)
    await session.commit()
    row = await _fetch_cultivo_row(session, new_id)
    return _to_cultivo_out(row)


@router.get("/{cultivo_id}", response_model=CultivoOut)
async def get_cultivo(
    cultivo_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CultivoOut:
    row = await _ensure_cultivo_access(session, cultivo_id, current_user)
    return _to_cultivo_out(row)


@router.patch("/{cultivo_id}", response_model=CultivoOut)
async def update_cultivo(
    cultivo_id: UUID,
    payload: CultivoUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> CultivoOut:
    current = await _ensure_cultivo_access(session, cultivo_id, current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        row = await _fetch_cultivo_row(session, cultivo_id)
        return _to_cultivo_out(row)
    # Un cultivo dado de baja (is_active = false) no se puede editar: solo se
    # admite el cambio que lo reactiva (is_active = true).
    if not current["is_active"] and values.get("is_active") is not True:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede editar un cultivo dado de baja. Reactívalo primero.",
        )

    params: dict = {"id": cultivo_id}
    clauses: list[str] = []
    simple_fields = {
        "biohuerto_id",
        "especie",
        "variedad",
        "fecha_siembra",
        "fecha_estimada_cosecha",
        "cantidad",
        "unidad_cantidad",
        "area_m2",
        "notas",
        "is_active",
    }
    for field in simple_fields:
        if field in values:
            params[field] = values[field]
            clauses.append(f"{field} = :{field}")
    if "etapa" in values:
        params["etapa"] = values["etapa"]
        clauses.append("etapa_id = (select id from etapas_fenologicas where codigo = :etapa)")
    if "campania" in values:
        params["campania"] = values["campania"]
        clauses.append("campania_id = (select id from campanias where nombre = :campania)")

    if clauses:
        await session.execute(
            text(f"update cultivos set {', '.join(clauses)} where id = :id and deleted_at is null"),
            params,
        )
    if "imagen" in values:
        await set_principal_image(
            session, column="cultivo_id", entity_id=cultivo_id, data_url=values["imagen"]
        )
    if values.get("etapa") == "cosecha":
        await _ensure_cosecha_for_cultivo(session, cultivo_id)
    await session.commit()
    row = await _fetch_cultivo_row(session, cultivo_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cultivo no encontrado")
    return _to_cultivo_out(row)


@router.delete("/{cultivo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cultivo(
    cultivo_id: UUID,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _ensure_cultivo_access(session, cultivo_id, current_user)
    await session.execute(
        text("update cultivos set deleted_at = now() where id = :id and deleted_at is null"),
        {"id": cultivo_id},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{cultivo_id}/historial", response_model=CultivoHistorial)
async def get_cultivo_historial(
    cultivo_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CultivoHistorial:
    cultivo_row = await _ensure_cultivo_access(session, cultivo_id, current_user)
    historial = await session.execute(
        text(
            """
            select h.id, ef.codigo as etapa, ef.nombre as etapa_nombre,
                   h.fecha, h.titulo, h.observacion
            from cultivos_historial_etapas h
            join etapas_fenologicas ef on ef.id = h.etapa_id
            where h.cultivo_id = :cultivo_id
            order by h.fecha desc, h.id desc
            """
        ),
        {"cultivo_id": cultivo_id},
    )
    return CultivoHistorial(
        cultivo=_to_cultivo_out(cultivo_row),
        historial=[dict(row) for row in historial.mappings().all()],
    )
