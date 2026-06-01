from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

EstadoAlerta = Literal["pendiente", "completada", "descartada"]


class AlertaCreate(BaseModel):
    biohuerto_id: int
    cultivo_id: UUID | None = None
    titulo: str = Field(min_length=2, max_length=160)
    descripcion: str | None = Field(default=None, max_length=1000)
    tipo: str = Field(min_length=2, max_length=80)
    prioridad: int = Field(default=2, ge=1, le=3)
    fecha_programada: datetime

    @field_validator("titulo", "descripcion", "tipo", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class AlertaUpdate(BaseModel):
    titulo: str | None = Field(default=None, min_length=2, max_length=160)
    descripcion: str | None = Field(default=None, max_length=1000)
    tipo: str | None = Field(default=None, min_length=2, max_length=80)
    prioridad: int | None = Field(default=None, ge=1, le=3)
    estado: EstadoAlerta | None = None
    fecha_programada: datetime | None = None

    @field_validator("titulo", "descripcion", "tipo", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class AlertaOut(BaseModel):
    id: int
    biohuerto_id: int | None
    cultivo_id: UUID | None
    user_id: int | None
    titulo: str
    descripcion: str | None
    tipo: str
    prioridad: int
    estado: EstadoAlerta
    fecha_programada: datetime
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

