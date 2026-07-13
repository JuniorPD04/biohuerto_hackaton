from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text


class PracticaCreate(BaseModel):
    cultivo_id: UUID
    tipo: str = Field(min_length=2, max_length=120)
    metodo_id: int | None = None  # el "cómo" (catálogo metodos_practica), opcional
    descripcion: str | None = Field(default=None, max_length=1000)  # opcional
    insumo_id: int | None = None
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    unidad_id: int | None = None
    fecha: date

    @field_validator("tipo", "descripcion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class PracticaOut(BaseModel):
    id: str
    cultivo_id: UUID
    tipo: str
    categoria: str
    metodo_id: int | None = None
    metodo: str | None = None
    descripcion: str
    insumo_id: int | None = None
    insumo: str | None = None
    cantidad: Decimal | None = None
    unidad_id: int | None = None
    unidad: str | None = None
    fecha: date
    sostenible: bool
    sin_agroquimicos: bool
    cultivo: str | None = None
    biohuerto: str | None = None
    biohuerto_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CostoCreate(BaseModel):
    cultivo_id: UUID
    categoria: str = Field(min_length=2, max_length=80)
    descripcion: str = Field(min_length=2, max_length=200)
    cantidad: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    unidad_id: int | None = None
    monto: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    moneda: str = Field(default="PEN", min_length=3, max_length=3)
    fecha: date

    @field_validator("categoria", "descripcion", "moneda", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        value = clean_text(value)
        return value.upper() if isinstance(value, str) and len(value) == 3 else value


class CostoOut(BaseModel):
    id: str
    cultivo_id: str
    categoria: str
    descripcion: str
    cantidad: Decimal | None = None
    unidad_id: int | None = None
    unidad: str | None = None
    monto: Decimal
    costo_unitario: Decimal | None = None  # calculado: monto / cantidad
    moneda: str
    fecha: date
    cultivo: str | None = None
    biohuerto: str | None = None
    biohuerto_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class TrazabilidadResumen(BaseModel):
    biohuerto_id: str
    total_practicas: int
    total_costos: Decimal
    practicas_sostenibles: int
    cultivos: int


class ProduccionHortalizaOut(BaseModel):
    """Una fila por hortaliza (especie), consolidando área, insumos,
    producción, autoconsumo, venta e inversión de todos sus cultivos."""

    hortaliza: str
    area_m2: Decimal
    fecha_preparacion: date | None = None
    fecha_siembra: date | None = None
    fecha_cosecha: date | None = None
    compost_kg: Decimal
    fecha_compost: date | None = None
    rrssoo_kg: Decimal = Decimal("0")
    otros_insumos: str | None = None
    inversion_insumos: Decimal
    produccion_total: Decimal
    produccion_unidad: str | None = None
    autoconsumo_total: Decimal
    venta_cantidad: Decimal
    venta_soles: Decimal
    utilidad: Decimal


class ProduccionZonaOut(BaseModel):
    """Una fila por zona geográfica del productor (ej. "Zona P.J."), para
    que la Coordinación Social compare producción entre zonas."""

    zona: str
    productores: int
    area_m2: Decimal
    produccion_total: Decimal
    venta_soles: Decimal

    model_config = ConfigDict(from_attributes=True)


class ReporteComunidadOut(BaseModel):
    """Una fila por comunidad/zona replicando la hoja "Ingresos Comunit" de la
    ficha oficial: desglose comunitario/individual, siembras/cosechas, insumos
    orgánicos, producción, consumo, inversión e ingresos."""

    comunidad: str
    biohuertos_comunitarios: int
    biohuertos_caseros: int
    area_comunitaria: Decimal
    area_casera: Decimal
    hogares: int
    siembras: int
    cosechas: int
    rrssoo_kg: Decimal
    compost_kg: Decimal
    produccion_total: Decimal
    autoconsumo_total: Decimal
    venta_cantidad: Decimal
    inversion: Decimal
    ingresos: Decimal

    model_config = ConfigDict(from_attributes=True)
