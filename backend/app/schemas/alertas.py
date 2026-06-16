from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

EstadoAlerta = Literal["pendiente", "completada", "descartada"]
PrioridadAlerta = Literal["baja", "media", "alta"]


class AlertaCreate(BaseModel):
    tipo: str = Field(min_length=2, max_length=80)
    titulo: str = Field(min_length=2, max_length=200)
    descripcion: str | None = Field(default=None, max_length=4000)
    cultivo_id: UUID | None = None
    biohuerto_id: UUID | None = None
    prioridad: PrioridadAlerta = "media"
    fecha_programada: datetime

    @field_validator("tipo", "titulo", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class AlertaUpdate(BaseModel):
    tipo: str | None = Field(default=None, min_length=2, max_length=80)
    titulo: str | None = Field(default=None, min_length=2, max_length=200)
    descripcion: str | None = Field(default=None, max_length=4000)
    prioridad: PrioridadAlerta | None = None
    estado: EstadoAlerta | None = None
    fecha_programada: datetime | None = None

    @field_validator("tipo", "titulo", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class AlertaOut(BaseModel):
    id: int
    tipo: str
    titulo: str
    descripcion: str | None = None
    cultivo_id: str | None = None
    cultivo: str | None = None
    biohuerto_id: str | None = None
    biohuerto: str | None = None
    prioridad: str
    estado: EstadoAlerta
    fecha_programada: datetime
    es_automatica: bool = False
    vista: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AlertasUnseenCount(BaseModel):
    count: int
