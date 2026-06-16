from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class PracticaCreate(BaseModel):
    cultivo_id: UUID
    tipo: str = Field(min_length=2, max_length=120)
    descripcion: str = Field(min_length=2, max_length=1000)
    insumo_id: int | None = None
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    unidad_id: int | None = None
    fecha: date

    @field_validator("tipo", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class PracticaOut(BaseModel):
    id: str
    cultivo_id: UUID
    tipo: str
    categoria: str
    descripcion: str
    insumo_id: int | None = None
    insumo: str | None = None
    cantidad: Decimal | None = None
    unidad_id: int | None = None
    unidad: str | None = None
    fecha: date
    sostenible: bool
    sin_agroquimicos: bool
    cultivo: str | None = None
    biohuerto: str | None = None
    biohuerto_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CostoCreate(BaseModel):
    cultivo_id: UUID
    categoria: str = Field(min_length=2, max_length=80)
    descripcion: str = Field(min_length=2, max_length=200)
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    unidad_id: int | None = None
    monto: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    moneda: str = Field(default="PEN", min_length=3, max_length=3)
    fecha: date

    @field_validator("categoria", "descripcion", "moneda", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        value = clean_text(value)
        return value.upper() if isinstance(value, str) and len(value) == 3 else value


class CostoOut(BaseModel):
    id: str
    cultivo_id: str
    categoria: str
    descripcion: str
    cantidad: Decimal | None = None
    unidad_id: int | None = None
    unidad: str | None = None
    monto: Decimal
    moneda: str
    fecha: date
    cultivo: str | None = None
    biohuerto: str | None = None
    biohuerto_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TrazabilidadResumen(BaseModel):
    biohuerto_id: str
    total_practicas: int
    total_costos: Decimal
    practicas_sostenibles: int
    cultivos: int
