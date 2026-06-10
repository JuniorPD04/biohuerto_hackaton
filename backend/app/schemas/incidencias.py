from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

SeveridadIncidencia = Literal["baja", "media", "alta"]
EstadoIncidencia = Literal["abierta", "en_revision", "cerrada"]


class IncidenciaCreate(BaseModel):
    cultivo_id: UUID
    tipo: str = Field(min_length=2, max_length=80)
    descripcion: str = Field(min_length=2, max_length=1000)
    severidad: SeveridadIncidencia = "media"
    zona_afectada: str | None = Field(default=None, max_length=120)
    estado: EstadoIncidencia = "abierta"
    reportado_en: datetime | None = None

    @field_validator("tipo", "descripcion", "zona_afectada", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class IncidenciaUpdate(BaseModel):
    tipo: str | None = Field(default=None, min_length=2, max_length=80)
    descripcion: str | None = Field(default=None, min_length=2, max_length=1000)
    severidad: SeveridadIncidencia | None = None
    zona_afectada: str | None = Field(default=None, max_length=120)
    estado: EstadoIncidencia | None = None

    @field_validator("tipo", "descripcion", "zona_afectada", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class IncidenciaOut(BaseModel):
    id: UUID
    cultivo_id: UUID
    tipo: str
    descripcion: str
    severidad: SeveridadIncidencia
    zona_afectada: str | None = None
    estado: EstadoIncidencia
    reportado_en: datetime

    model_config = ConfigDict(from_attributes=True)
