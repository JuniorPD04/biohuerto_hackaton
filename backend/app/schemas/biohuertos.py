from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

_COORD_Q = Decimal("0.000001")  # 6 decimales → cabe en NUMERIC(9,6)


def _round_coord(value):
    """Redondea lat/lng a 6 decimales (el mapa las envía con más precisión)."""
    if value is None or value == "":
        return None
    return Decimal(str(value)).quantize(_COORD_Q, rounding=ROUND_HALF_UP)


class BiohuertoCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=160)
    # Opcional: si no viene, se deriva del nombre y se numera para que sea único.
    codigo: str | None = Field(default=None, max_length=20)
    ubicacion_referencia: str | None = Field(default=None, max_length=240)
    area_m2: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    descripcion: str | None = Field(default=None, max_length=1000)
    tipo_area_id: int | None = None
    abreviatura: str | None = Field(default=None, max_length=20)
    latitud: Decimal | None = Field(default=None, max_digits=9, decimal_places=6)
    longitud: Decimal | None = Field(default=None, max_digits=9, decimal_places=6)
    estado: str | None = Field(default=None, max_length=20)
    imagen: str | None = None  # data URL (data:image/...;base64,...) opcional

    @field_validator("nombre", "codigo", "abreviatura", "ubicacion_referencia", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)

    @field_validator("latitud", "longitud", mode="before")
    @classmethod
    def round_coord(cls, value):
        return _round_coord(value)


class BiohuertoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=160)
    codigo: str | None = Field(default=None, min_length=2, max_length=20)
    ubicacion_referencia: str | None = Field(default=None, max_length=240)
    area_m2: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    descripcion: str | None = Field(default=None, max_length=1000)
    tipo_area_id: int | None = None
    abreviatura: str | None = Field(default=None, max_length=20)
    latitud: Decimal | None = Field(default=None, max_digits=9, decimal_places=6)
    longitud: Decimal | None = Field(default=None, max_digits=9, decimal_places=6)
    estado: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None
    imagen: str | None = None  # data URL nuevo, "" / null para quitar la imagen

    @field_validator("nombre", "codigo", "abreviatura", "ubicacion_referencia", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)

    @field_validator("latitud", "longitud", mode="before")
    @classmethod
    def round_coord(cls, value):
        return _round_coord(value)


class BiohuertoOut(BaseModel):
    id: str
    codigo: str
    nombre: str
    ubicacion_referencia: str | None = None
    area_m2: Decimal
    descripcion: str | None = None
    tipo_area_id: int | None = None
    tipo_area: str | None = None
    abreviatura: str | None = None
    latitud: Decimal | None = None
    longitud: Decimal | None = None
    estado: str | None = None
    cultivos_count: int = 0
    is_active: bool = True
    imagen: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
