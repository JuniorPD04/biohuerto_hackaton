from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.common import clean_text

EtapaCultivo = Literal["semillero", "crecimiento", "floracion", "fructificacion", "cosecha", "finalizado"]


class CultivoCreate(BaseModel):
    biohuerto_id: int
    especie: str = Field(min_length=2, max_length=120)
    variedad: str | None = Field(default=None, max_length=120)
    etapa: EtapaCultivo = "semillero"
    fecha_siembra: date
    fecha_estimada_cosecha: date | None = None
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    area_m2: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    campania: str | None = Field(default=None, max_length=120)
    notas: str | None = Field(default=None, max_length=1000)

    @field_validator("especie", "variedad", "campania", "notas", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "CultivoCreate":
        if self.fecha_estimada_cosecha and self.fecha_estimada_cosecha < self.fecha_siembra:
            raise ValueError("La fecha estimada de cosecha no puede ser anterior a la siembra.")
        return self


class CultivoUpdate(BaseModel):
    especie: str | None = Field(default=None, min_length=2, max_length=120)
    variedad: str | None = Field(default=None, max_length=120)
    etapa: EtapaCultivo | None = None
    fecha_siembra: date | None = None
    fecha_estimada_cosecha: date | None = None
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    area_m2: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    campania: str | None = Field(default=None, max_length=120)
    notas: str | None = Field(default=None, max_length=1000)

    @field_validator("especie", "variedad", "campania", "notas", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class CultivoOut(BaseModel):
    id: UUID
    biohuerto_id: int | None
    user_id: int | None
    especie: str
    variedad: str | None
    etapa: EtapaCultivo
    fecha_siembra: date
    fecha_estimada_cosecha: date | None
    cantidad: Decimal | None
    area_m2: Decimal | None
    campania: str | None
    notas: str | None
    is_synced: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CultivoHistorial(BaseModel):
    cultivo: CultivoOut
    monitoreos: list[dict]
    alertas: list[dict]
    cosechas: list[dict]

