from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class CuidadoCreate(BaseModel):
    cultivo_id: UUID
    tipo: str = Field(min_length=2, max_length=80)
    descripcion: str | None = Field(default=None, max_length=200)
    frecuencia_dias: int = Field(gt=0, le=365)

    @field_validator("tipo", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class CuidadoUpdate(BaseModel):
    tipo: str | None = Field(default=None, min_length=2, max_length=80)
    descripcion: str | None = Field(default=None, max_length=200)
    frecuencia_dias: int | None = Field(default=None, gt=0, le=365)
    is_active: bool | None = None

    @field_validator("tipo", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class CuidadoOut(BaseModel):
    id: str
    cultivo_id: str
    tipo: str
    descripcion: str | None = None
    frecuencia_dias: int
    ultima_realizada: datetime | None = None
    proxima_fecha: datetime | None = None
    vencido: bool = False
    is_active: bool
    cultivo: str | None = None
    biohuerto: str | None = None
    biohuerto_id: str | None = None

    model_config = ConfigDict(from_attributes=True)
