from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class BiohuertoCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=160)
    codigo: str = Field(min_length=2, max_length=60)
    ubicacion_referencia: str | None = Field(default=None, max_length=240)
    area_m2: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    descripcion: str | None = Field(default=None, max_length=1000)
    user_id: int | None = None

    @field_validator("nombre", "codigo", "ubicacion_referencia", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class BiohuertoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=160)
    codigo: str | None = Field(default=None, min_length=2, max_length=60)
    ubicacion_referencia: str | None = Field(default=None, max_length=240)
    area_m2: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    descripcion: str | None = Field(default=None, max_length=1000)

    @field_validator("nombre", "codigo", "ubicacion_referencia", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class BiohuertoOut(BaseModel):
    id: int
    user_id: int | None
    nombre: str
    codigo: str
    ubicacion_referencia: str | None = None
    area_m2: Decimal
    descripcion: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

