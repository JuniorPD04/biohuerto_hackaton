from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

PrioridadRecomendacion = Literal["urgente", "importante", "recomendada"]
TipoManejo = Literal["organico", "biologico", "cultural"]
OrigenRecomendacion = Literal["rag", "manual", "diagnostico"]


class RecomendacionCreate(BaseModel):
    cultivo_id: UUID | None = None
    diagnostico_id: UUID | None = None
    titulo: str = Field(min_length=2, max_length=200)
    cuerpo: str = Field(min_length=2)
    categoria: str = Field(min_length=2, max_length=80)
    tipo_manejo: TipoManejo = "organico"
    prioridad: PrioridadRecomendacion = "recomendada"
    fuente: str | None = Field(default=None, max_length=200)

    @field_validator("titulo", "cuerpo", "categoria", "fuente", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class RecomendacionUpdate(BaseModel):
    aplicada: bool


class RecomendacionOut(BaseModel):
    id: int
    cultivo_id: UUID | None = None
    diagnostico_id: UUID | None = None
    titulo: str
    descripcion: str
    categoria: str
    tipo: TipoManejo
    prioridad: PrioridadRecomendacion
    aplicada: bool = False
    fecha: datetime

    model_config = ConfigDict(from_attributes=True)
