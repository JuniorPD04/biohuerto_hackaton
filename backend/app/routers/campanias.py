"""Gestión de campañas / temporadas."""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.dependencies import get_current_user
from app.schemas.users import CurrentUser

router = APIRouter(prefix="/api/campanias", tags=["campanias"])

_SELECT = """
    select c.id, c.nombre, c.fecha_inicio, c.fecha_fin, c.activa,
           c.created_at, c.updated_at,
           (select count(*) from cultivos cu
             where cu.campania_id = c.id and cu.deleted_at is null) as cultivos_count
    from campanias c
"""


class CampaniaBase(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    activa: bool | None = None

    @model_validator(mode="after")
    def _check_fechas(self):
        if self.fecha_inicio and self.fecha_fin and self.fecha_fin < self.fecha_inicio:
            raise ValueError("La fecha fin no puede ser anterior a la fecha inicio")
        return self


class CampaniaCreate(CampaniaBase):
    nombre: str = Field(min_length=2, max_length=120)
    fecha_inicio: date
    fecha_fin: date
    activa: bool = False


class CampaniaOut(BaseModel):
    id: int
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    activa: bool
    cultivos_count: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


async def _get_one(session: AsyncSession, campania_id: int) -> CampaniaOut:
    result = await session.execute(
        text(_SELECT + " where c.id = :id and c.deleted_at is null"), {"id": campania_id}
    )
    row = result.mappings().first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaña no encontrada")
    return CampaniaOut.model_validate(dict(row))


@router.get("", response_model=list[CampaniaOut])
async def list_campanias(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CampaniaOut]:
    result = await session.execute(
        text(_SELECT + " where c.deleted_at is null order by c.fecha_inicio desc")
    )
    return [CampaniaOut.model_validate(dict(r)) for r in result.mappings().all()]


@router.post("", response_model=CampaniaOut, status_code=status.HTTP_201_CREATED)
async def create_campania(
    payload: CampaniaCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CampaniaOut:
    try:
        result = await session.execute(
            text(
                """
                insert into campanias (nombre, fecha_inicio, fecha_fin, activa)
                values (:nombre, :fecha_inicio, :fecha_fin, :activa)
                returning id
                """
            ),
            payload.model_dump(),
        )
        new_id = result.scalar_one()
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Ya existe una campaña con ese nombre"
        ) from exc
    return await _get_one(session, new_id)


@router.patch("/{campania_id}", response_model=CampaniaOut)
async def update_campania(
    campania_id: int,
    payload: CampaniaBase,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CampaniaOut:
    await _get_one(session, campania_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _get_one(session, campania_id)
    clauses = [f"{k} = :{k}" for k in values]
    values["id"] = campania_id
    try:
        await session.execute(
            text(f"update campanias set {', '.join(clauses)} where id = :id and deleted_at is null"),
            values,
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Ya existe una campaña con ese nombre"
        ) from exc
    return await _get_one(session, campania_id)


@router.delete("/{campania_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campania(
    campania_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await _get_one(session, campania_id)
    # Soft delete: las campañas pueden estar referenciadas por cultivos (ON DELETE SET NULL).
    await session.execute(
        text("update campanias set deleted_at = now() where id = :id"), {"id": campania_id}
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
