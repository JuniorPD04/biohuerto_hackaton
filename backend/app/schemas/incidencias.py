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
    zona_id: int | None = None
    estado: EstadoIncidencia = "abierta"
    reportado_en: datetime | None = None

    @field_validator("tipo", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class IncidenciaUpdate(BaseModel):
    tipo: str | None = Field(default=None, min_length=2, max_length=80)
    descripcion: str | None = Field(default=None, min_length=2, max_length=1000)
    severidad: SeveridadIncidencia | None = None
    zona_id: int | None = None
    estado: EstadoIncidencia | None = None

    @field_validator("tipo", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class IncidenciaOut(BaseModel):
    id: str
    cultivo_id: str
    cultivo: str | None = None
    biohuerto_id: str | None = None
    biohuerto: str | None = None
    tipo: str
    descripcion: str
    severidad: SeveridadIncidencia
    zona_id: int | None = None
    zona_afectada: str | None = None
    estado: EstadoIncidencia
    reportado_en: datetime

    model_config = ConfigDict(from_attributes=True)
