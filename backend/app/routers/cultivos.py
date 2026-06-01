from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.schemas.cultivos import CultivoCreate, CultivoHistorial, CultivoOut, CultivoUpdate
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/cultivos", tags=["cultivos"])


def _to_cultivo_out(row) -> CultivoOut:
    return CultivoOut.model_validate(dict(row))


async def _fetch_cultivo_row(session: AsyncSession, cultivo_id: UUID):
    result = await session.execute(
        text(
            """
            select id, biohuerto_id, user_id, especie, variedad, etapa, fecha_siembra,
                   fecha_estimada_cosecha, cantidad, area_m2, campania, notas,
                   is_synced, created_at, updated_at
            from cultivos
            where id = :id
              and deleted_at is null
            """
        ),
        {"id": cultivo_id},
    )
    return result.mappings().first()


async def _ensure_cultivo_access(
    session: AsyncSession,
    cultivo_id: UUID,
    current_user: CurrentUser,
):
    row = await _fetch_cultivo_row(session, cultivo_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cultivo no encontrado")
    if current_user.rol != "admin" and row["user_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes acceder a este cultivo")
    return row


@router.get("", response_model=list[CultivoOut])
async def list_cultivos(
    biohuerto_id: int | None = None,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CultivoOut]:
    params: dict = {}
    filters = ["deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("user_id = :user_id")
        params["user_id"] = current_user.id
    if biohuerto_id is not None:
        filters.append("biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id

    result = await session.execute(
        text(
            f"""
            select id, biohuerto_id, user_id, especie, variedad, etapa, fecha_siembra,
                   fecha_estimada_cosecha, cantidad, area_m2, campania, notas,
                   is_synced, created_at, updated_at
            from cultivos
            where {" and ".join(filters)}
            order by created_at desc
            """
        ),
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
              biohuerto_id, user_id, especie, variedad, etapa, fecha_siembra,
              fecha_estimada_cosecha, cantidad, area_m2, campania, notas
            )
            values (
              :biohuerto_id, :user_id, :especie, :variedad, :etapa, :fecha_siembra,
              :fecha_estimada_cosecha, :cantidad, :area_m2, :campania, :notas
            )
            returning id, biohuerto_id, user_id, especie, variedad, etapa, fecha_siembra,
                      fecha_estimada_cosecha, cantidad, area_m2, campania, notas,
                      is_synced, created_at, updated_at
            """
        ),
        {
            "biohuerto_id": payload.biohuerto_id,
            "user_id": current_user.id,
            "especie": payload.especie,
            "variedad": payload.variedad,
            "etapa": payload.etapa,
            "fecha_siembra": payload.fecha_siembra,
            "fecha_estimada_cosecha": payload.fecha_estimada_cosecha,
            "cantidad": payload.cantidad,
            "area_m2": payload.area_m2,
            "campania": payload.campania,
            "notas": payload.notas,
        },
    )
    await session.commit()
    return _to_cultivo_out(result.mappings().one())


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
    await _ensure_cultivo_access(session, cultivo_id, current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        row = await _fetch_cultivo_row(session, cultivo_id)
        return _to_cultivo_out(row)

    params: dict = {"id": cultivo_id}
    clauses: list[str] = []
    allowed_fields = {
        "especie",
        "variedad",
        "etapa",
        "fecha_siembra",
        "fecha_estimada_cosecha",
        "cantidad",
        "area_m2",
        "campania",
        "notas",
    }
    for field in allowed_fields:
        if field in values:
            params[field] = values[field]
            clauses.append(f"{field} = :{field}")

    result = await session.execute(
        text(
            f"""
            update cultivos
            set {", ".join(clauses)}
            where id = :id
              and deleted_at is null
            returning id, biohuerto_id, user_id, especie, variedad, etapa, fecha_siembra,
                      fecha_estimada_cosecha, cantidad, area_m2, campania, notas,
                      is_synced, created_at, updated_at
            """
        ),
        params,
    )
    await session.commit()
    row = result.mappings().first()
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

    monitoreos = await session.execute(
        text(
            """
            select id::text, humedad_porcentaje, temperatura_c, luminosidad_lux,
                   incidencia, observacion, registrado_en
            from monitoreo_registros
            where cultivo_id = :cultivo_id
              and deleted_at is null
            order by registrado_en desc
            limit 20
            """
        ),
        {"cultivo_id": cultivo_id},
    )
    alertas = await session.execute(
        text(
            """
            select id, titulo, tipo, prioridad, estado, fecha_programada
            from alertas
            where cultivo_id = :cultivo_id
              and deleted_at is null
            order by fecha_programada asc
            limit 20
            """
        ),
        {"cultivo_id": cultivo_id},
    )
    cosechas = await session.execute(
        text(
            """
            select id::text, nombre_producto, cantidad, unidad, precio_referencial, fecha_cosecha, disponible
            from cosechas
            where cultivo_id = :cultivo_id
              and deleted_at is null
            order by fecha_cosecha desc
            limit 20
            """
        ),
        {"cultivo_id": cultivo_id},
    )

    return CultivoHistorial(
        cultivo=_to_cultivo_out(cultivo_row),
        monitoreos=[dict(row) for row in monitoreos.mappings().all()],
        alertas=[dict(row) for row in alertas.mappings().all()],
        cosechas=[dict(row) for row in cosechas.mappings().all()],
    )

