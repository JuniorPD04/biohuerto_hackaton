from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class BiohuertoCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=160)
    codigo: str = Field(min_length=2, max_length=20)
    ubicacion_referencia: str | None = Field(default=None, max_length=240)
    area_m2: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    descripcion: str | None = Field(default=None, max_length=1000)
    responsable_id: int | None = None
    imagen: str | None = None  # data URL (data:image/...;base64,...) opcional

    @field_validator("nombre", "codigo", "ubicacion_referencia", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class BiohuertoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=160)
    codigo: str | None = Field(default=None, min_length=2, max_length=20)
    ubicacion_referencia: str | None = Field(default=None, max_length=240)
    area_m2: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    descripcion: str | None = Field(default=None, max_length=1000)
    responsable_id: int | None = None
    is_active: bool | None = None
    imagen: str | None = None  # data URL nuevo, "" / null para quitar la imagen

    @field_validator("nombre", "codigo", "ubicacion_referencia", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class BiohuertoOut(BaseModel):
    id: int
    codigo: str
    nombre: str
    ubicacion_referencia: str | None = None
    area_m2: Decimal
    descripcion: str | None = None
    responsable_id: int | None = None
    responsable_nombre: str | None = None
    cultivos_count: int = 0
    is_active: bool = True
    imagen: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
