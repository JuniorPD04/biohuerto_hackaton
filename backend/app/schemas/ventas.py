from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

EstadoRonda = Literal["abierta", "cerrada"]


class VentaRondaCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=160)
    fecha: date | None = None
    hora_inicio: time | None = None
    usuario_id: int | None = None  # solo admin: abrir ronda a nombre de otro productor

    @field_validator("nombre", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class VentaRondaUpdate(BaseModel):
    estado: Literal["cerrada"]


class VentaItemIn(BaseModel):
    cosecha_id: UUID
    cantidad: Decimal = Field(gt=0, max_digits=10, decimal_places=2)


class VentaItemsCreate(BaseModel):
    items: list[VentaItemIn] = Field(min_length=1)


class VentaOut(BaseModel):
    id: str
    ronda_id: str
    cosecha_id: str | None = None
    usuario_id: int
    nombre_producto: str
    cultivo: str | None = None
    precio_unitario: Decimal
    cantidad: Decimal
    unidad_id: int | None = None
    unidad: str | None = None
    total: Decimal
    fecha: date
    hora: time
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VentaRondaOut(BaseModel):
    id: str
    usuario_id: int
    productor: str | None = None
    nombre: str
    fecha: date
    hora_inicio: time
    estado: EstadoRonda
    total_items: int
    total_monto: Decimal
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VentaRondaDetalleOut(VentaRondaOut):
    items: list[VentaOut]
