from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user, require_role
from app.routers.biohuertos import _ensure_biohuerto_access
from app.routers.cultivos import _ensure_cultivo_access
from app.schemas.alertas import AlertaCreate, AlertaOut, AlertaUpdate, EstadoAlerta
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/alertas", tags=["alertas"])


def _to_alerta_out(row) -> AlertaOut:
    return AlertaOut.model_validate(dict(row))


async def _validate_scope(session: AsyncSession, current_user: CurrentUser, biohuerto_id: int, cultivo_id) -> None:
    await _ensure_biohuerto_access(session, biohuerto_id, current_user)
    if cultivo_id is not None:
        cultivo = await _ensure_cultivo_access(session, cultivo_id, current_user)
        if cultivo["biohuerto_id"] != biohuerto_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El cultivo no pertenece al biohuerto indicado",
            )


async def _fetch_alerta(session: AsyncSession, alerta_id: int):
    result = await session.execute(
        text(
            """
            select id, biohuerto_id, cultivo_id, user_id, titulo, descripcion, tipo,
                   prioridad, estado, fecha_programada, created_at, updated_at
            from alertas
            where id = :id
              and deleted_at is null
            """
        ),
        {"id": alerta_id},
    )
    return result.mappings().first()


async def _ensure_alerta_access(session: AsyncSession, alerta_id: int, current_user: CurrentUser):
    row = await _fetch_alerta(session, alerta_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")
    if current_user.rol != "admin" and row["user_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes acceder a esta alerta")
    return row


@router.get("", response_model=list[AlertaOut])
async def list_alertas(
    biohuerto_id: int | None = None,
    estado: EstadoAlerta | None = None,
    order_by: str = Query(default="fecha", pattern="^(fecha|prioridad)$"),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[AlertaOut]:
    params: dict = {}
    filters = ["deleted_at is null"]
    if current_user.rol != "admin":
        filters.append("user_id = :user_id")
        params["user_id"] = current_user.id
    if biohuerto_id is not None:
        await _ensure_biohuerto_access(session, biohuerto_id, current_user)
        filters.append("biohuerto_id = :biohuerto_id")
        params["biohuerto_id"] = biohuerto_id
    if estado is not None:
        filters.append("estado = :estado")
        params["estado"] = estado

    order_sql = "prioridad asc, fecha_programada asc" if order_by == "prioridad" else "fecha_programada asc, prioridad asc"
    result = await session.execute(
        text(
            f"""
            select id, biohuerto_id, cultivo_id, user_id, titulo, descripcion, tipo,
                   prioridad, estado, fecha_programada, created_at, updated_at
            from alertas
            where {" and ".join(filters)}
            order by {order_sql}
            limit 100
            """
        ),
        params,
    )
    return [_to_alerta_out(row) for row in result.mappings().all()]


@router.post("", response_model=AlertaOut, status_code=status.HTTP_201_CREATED)
async def create_alerta(
    payload: AlertaCreate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> AlertaOut:
    await _validate_scope(session, current_user, payload.biohuerto_id, payload.cultivo_id)
    result = await session.execute(
        text(
            """
            insert into alertas (
              biohuerto_id, cultivo_id, user_id, titulo, descripcion, tipo,
              prioridad, estado, fecha_programada
            )
            values (
              :biohuerto_id, :cultivo_id, :user_id, :titulo, :descripcion, :tipo,
              :prioridad, 'pendiente', :fecha_programada
            )
            returning id, biohuerto_id, cultivo_id, user_id, titulo, descripcion, tipo,
                      prioridad, estado, fecha_programada, created_at, updated_at
            """
        ),
        {
            "biohuerto_id": payload.biohuerto_id,
            "cultivo_id": payload.cultivo_id,
            "user_id": current_user.id,
            "titulo": payload.titulo,
            "descripcion": payload.descripcion,
            "tipo": payload.tipo,
            "prioridad": payload.prioridad,
            "fecha_programada": payload.fecha_programada,
        },
    )
    await session.commit()
    return _to_alerta_out(result.mappings().one())


@router.get("/{alerta_id}", response_model=AlertaOut)
async def get_alerta(
    alerta_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AlertaOut:
    return _to_alerta_out(await _ensure_alerta_access(session, alerta_id, current_user))


@router.patch("/{alerta_id}", response_model=AlertaOut)
async def update_alerta(
    alerta_id: int,
    payload: AlertaUpdate,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> AlertaOut:
    await _ensure_alerta_access(session, alerta_id, current_user)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await get_alerta(alerta_id, current_user, session)

    allowed_fields = {"titulo", "descripcion", "tipo", "prioridad", "estado", "fecha_programada"}
    params = {"id": alerta_id}
    clauses: list[str] = []
    for field in allowed_fields:
        if field in values:
            params[field] = values[field]
            clauses.append(f"{field} = :{field}")

    result = await session.execute(
        text(
            f"""
            update alertas
            set {", ".join(clauses)}
            where id = :id
              and deleted_at is null
            returning id, biohuerto_id, cultivo_id, user_id, titulo, descripcion, tipo,
                      prioridad, estado, fecha_programada, created_at, updated_at
            """
        ),
        params,
    )
    await session.commit()
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alerta no encontrada")
    return _to_alerta_out(row)


@router.delete("/{alerta_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alerta(
    alerta_id: int,
    current_user: CurrentUser = Depends(require_role("productor", "admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _ensure_alerta_access(session, alerta_id, current_user)
    await session.execute(
        text("update alertas set deleted_at = now() where id = :id and deleted_at is null"),
        {"id": alerta_id},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

