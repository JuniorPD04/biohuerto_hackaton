from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import clean_text

EtapaCultivo = Literal["semillero", "crecimiento", "floracion", "fructificacion", "cosecha", "finalizado"]


class CultivoCreate(BaseModel):
    biohuerto_id: str
    especie_id: int
    variedad: str | None = Field(default=None, max_length=120)
    etapa: EtapaCultivo = "semillero"
    fecha_siembra: date
    fecha_estimada_cosecha: date | None = None
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    unidad_id: int | None = None
    area_m2: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    campania: str | None = Field(default=None, max_length=120)
    notas: str | None = Field(default=None, max_length=1000)
    imagen: str | None = None  # data URL (data:image/...;base64,...) opcional

    @field_validator("variedad", "campania", "notas", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "CultivoCreate":
        if self.fecha_estimada_cosecha and self.fecha_estimada_cosecha < self.fecha_siembra:
            raise ValueError("La fecha estimada de cosecha no puede ser anterior a la siembra.")
        return self


class CultivoUpdate(BaseModel):
    biohuerto_id: str | None = None
    especie_id: int | None = None
    variedad: str | None = Field(default=None, max_length=120)
    etapa: EtapaCultivo | None = None
    fecha_siembra: date | None = None
    fecha_estimada_cosecha: date | None = None
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    unidad_id: int | None = None
    area_m2: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    campania: str | None = Field(default=None, max_length=120)
    notas: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None
    imagen: str | None = None  # data URL nuevo, "" / null para quitar la imagen

    @field_validator("variedad", "campania", "notas", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class CultivoOut(BaseModel):
    id: str
    biohuerto_id: str | None
    biohuerto_nombre: str | None = None
    usuario_id: int | None = None
    especie: str
    especie_id: int | None = None
    variedad: str | None = None
    etapa: EtapaCultivo
    etapa_nombre: str | None = None
    fecha_siembra: date
    fecha_estimada_cosecha: date | None = None
    cantidad: Decimal | None = None
    unidad: str | None = None
    unidad_id: int | None = None
    area_m2: Decimal | None = None
    campania: str | None = None
    notas: str | None = None
    is_active: bool = True
    imagen: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CultivoHistorial(BaseModel):
    cultivo: CultivoOut
    historial: list[dict]
