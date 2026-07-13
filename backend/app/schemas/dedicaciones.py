from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class DedicacionCreate(BaseModel):
    biohuerto_id: UUID
    actividad_id: int
    fecha: date
    horas: Decimal = Field(gt=0, max_digits=5, decimal_places=2)
    observacion: str | None = Field(default=None, max_length=200)

    @field_validator("observacion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class DedicacionOut(BaseModel):
    id: str
    biohuerto_id: str
    biohuerto: str | None = None
    usuario_id: int
    usuario: str | None = None
    actividad_id: int
    actividad: str | None = None
    fecha: date
    horas: Decimal
    observacion: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DedicacionResumen(BaseModel):
    """Agregado por biohuerto: total de horas y personas que participaron
    (para la hoja "Inversión x biohuerto" de la ficha)."""

    biohuerto_id: str
    total_horas: Decimal
    personas: int
