from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class MonitoreoCreate(BaseModel):
    cultivo_id: UUID
    humedad_pct: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    temperatura_c: Decimal | None = Field(default=None, ge=-10, le=60, max_digits=5, decimal_places=2)
    luminosidad_lux: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    ph_suelo: Decimal | None = Field(default=None, ge=0, le=14, max_digits=4, decimal_places=2)
    observacion: str | None = Field(default=None, max_length=1000)

    @field_validator("observacion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class MonitoreoOut(BaseModel):
    id: UUID
    cultivo_id: UUID
    fuente: str
    sensor_codigo: str | None = None
    registrado_en: datetime
    humedad_pct: Decimal | None = None
    temperatura_c: Decimal | None = None
    luminosidad_lux: Decimal | None = None
    ph_suelo: Decimal | None = None
    observacion: str | None = None
    luminosidad_nivel: str | None = None

    model_config = ConfigDict(from_attributes=True)
