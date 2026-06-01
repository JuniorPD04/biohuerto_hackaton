from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class MonitoreoCreate(BaseModel):
    biohuerto_id: int
    cultivo_id: UUID | None = None
    humedad_porcentaje: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    temperatura_c: Decimal | None = Field(default=None, ge=-10, le=60, max_digits=5, decimal_places=2)
    luminosidad_lux: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    incidencia: str | None = Field(default=None, max_length=500)
    observacion: str | None = Field(default=None, max_length=1000)
    registrado_en: datetime | None = None

    @field_validator("incidencia", "observacion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class MonitoreoOut(BaseModel):
    id: UUID
    biohuerto_id: int | None
    cultivo_id: UUID | None
    user_id: int | None
    humedad_porcentaje: Decimal | None
    temperatura_c: Decimal | None
    luminosidad_lux: Decimal | None
    incidencia: str | None
    observacion: str | None
    registrado_en: datetime
    is_synced: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

