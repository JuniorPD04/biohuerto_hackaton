from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class AutoconsumoCreate(BaseModel):
    cosecha_id: UUID
    cantidad: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    fecha: date | None = None
    notas: str | None = Field(default=None, max_length=200)

    @field_validator("notas", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class AutoconsumoOut(BaseModel):
    id: str
    cosecha_id: str
    usuario_id: int
    nombre_producto: str
    cultivo: str | None = None
    cantidad: Decimal
    unidad_id: int | None = None
    unidad: str | None = None
    fecha: date
    notas: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
