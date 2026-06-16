from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

EstadoCosecha = Literal["disponible", "publicado", "agotado", "baja"]


class CosechaCreate(BaseModel):
    nombre_producto: str = Field(min_length=2, max_length=140)
    cantidad: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    unidad_id: int | None = None
    precio_referencial: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    fecha_cosecha: date
    cultivo_id: UUID | None = None
    usuario_id: int | None = None
    link_whatsapp: str | None = None
    telefono: str | None = Field(default=None, max_length=40)
    estado: EstadoCosecha = "disponible"

    @field_validator("nombre_producto", "link_whatsapp", "telefono", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class CosechaUpdate(BaseModel):
    nombre_producto: str | None = Field(default=None, min_length=2, max_length=140)
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    unidad_id: int | None = None
    precio_referencial: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    fecha_cosecha: date | None = None
    link_whatsapp: str | None = None
    telefono: str | None = Field(default=None, max_length=40)
    estado: EstadoCosecha | None = None

    @field_validator("nombre_producto", "link_whatsapp", "telefono", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class CosechaOut(BaseModel):
    id: str
    cultivo_id: str | None = None
    cultivo: str | None = None
    cultivo_imagen: str | None = None
    usuario_id: int
    productor: str | None = None
    productor_telefono: str | None = None
    nombre_producto: str
    cantidad: Decimal
    unidad_id: int | None = None
    unidad: str | None = None
    precio_referencial: Decimal
    fecha_cosecha: date
    link_whatsapp: str | None = None
    telefono: str | None = None
    estado: EstadoCosecha = "disponible"
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
