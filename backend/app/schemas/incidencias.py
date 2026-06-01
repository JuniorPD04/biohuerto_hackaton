from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

SeveridadIncidencia = Literal["baja", "media", "alta"]
EstadoIncidencia = Literal["abierta", "en_revision", "cerrada"]


class IncidenciaCreate(BaseModel):
    biohuerto_id: int
    cultivo_id: UUID | None = None
    tipo: str = Field(min_length=2, max_length=80)
    descripcion: str = Field(min_length=2, max_length=1000)
    severidad: SeveridadIncidencia = "media"
    estado: EstadoIncidencia = "abierta"
    reportado_en: datetime | None = None

    @field_validator("tipo", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class IncidenciaOut(BaseModel):
    id: UUID
    biohuerto_id: int | None
    cultivo_id: UUID | None
    user_id: int | None
    tipo: str
    descripcion: str
    severidad: SeveridadIncidencia
    estado: EstadoIncidencia
    reportado_en: datetime
    is_synced: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

