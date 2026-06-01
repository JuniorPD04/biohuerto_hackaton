from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class PracticaCreate(BaseModel):
    biohuerto_id: int
    cultivo_id: UUID | None = None
    tipo_practica: str = Field(min_length=2, max_length=120)
    descripcion: str = Field(min_length=2, max_length=1000)
    insumo: str | None = Field(default=None, max_length=120)
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    unidad: str | None = Field(default=None, max_length=30)
    fecha_aplicacion: date
    es_sostenible: bool = True

    @field_validator("tipo_practica", "descripcion", "insumo", "unidad", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class PracticaOut(BaseModel):
    id: int
    biohuerto_id: int | None
    cultivo_id: UUID | None
    user_id: int | None
    tipo_practica: str
    descripcion: str
    insumo: str | None
    cantidad: Decimal | None
    unidad: str | None
    fecha_aplicacion: date
    es_sostenible: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CostoCreate(BaseModel):
    biohuerto_id: int
    cultivo_id: UUID | None = None
    categoria: str = Field(min_length=2, max_length=80)
    descripcion: str = Field(min_length=2, max_length=1000)
    monto: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    moneda: str = Field(default="PEN", min_length=3, max_length=3)
    fecha: date

    @field_validator("categoria", "descripcion", "moneda", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        value = clean_text(value)
        return value.upper() if isinstance(value, str) and len(value) == 3 else value


class CostoOut(BaseModel):
    id: int
    biohuerto_id: int | None
    cultivo_id: UUID | None
    user_id: int | None
    categoria: str
    descripcion: str
    monto: Decimal
    moneda: str
    fecha: date
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TrazabilidadResumen(BaseModel):
    biohuerto_id: int
    practicas_total: int
    practicas_sostenibles: int
    sostenibilidad_porcentaje: Decimal
    costos_total: Decimal
    costos_por_categoria: dict[str, Decimal]

