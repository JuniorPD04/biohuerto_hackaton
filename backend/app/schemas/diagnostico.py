from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

NivelRiesgo = Literal["bajo", "medio", "alto"]
PartePlanta = Literal["Hoja", "Fruto", "Tallo", "Raíz", "Planta completa"]


class DiagnosticoGuiadoCreate(BaseModel):
    biohuerto_id: int | None = None
    cultivo_id: UUID | None = None
    incidencia_id: UUID | None = None
    especie: str = Field(min_length=2, max_length=120)
    parte_planta: PartePlanta = "Hoja"
    sintomas: list[str] = Field(min_length=1, max_length=12)
    zona_afectada: str | None = Field(default=None, max_length=120)
    tiempo_dias: int | None = Field(default=None, ge=0, le=365)
    observaciones_previas: str | None = Field(default=None, max_length=1000)

    @field_validator("especie", "zona_afectada", "observaciones_previas", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)

    @field_validator("sintomas", mode="before")
    @classmethod
    def sanitize_sintomas(cls, value):
        if not isinstance(value, list):
            return value
        return [clean_text(item) for item in value if clean_text(item)]


class DiagnosticoImagenCreate(BaseModel):
    cultivo_id: UUID | None = None
    parte_planta: PartePlanta | None = None
    image_base64: str = Field(min_length=64)
    mime_type: str = Field(default="image/jpeg", pattern="^image/(jpeg|jpg|png|webp)$")


class DiagnosticoResult(BaseModel):
    problema: str
    nivel_riesgo: NivelRiesgo | None = None
    recomendacion: str = ""
    acciones: list[str] = Field(default_factory=list)
    confianza: int = Field(default=70, ge=0, le=100)
    nombre_cientifico: str | None = None
    es_sano: bool = False
    alternativas: list["DiagnosticoAlternativaResult"] = Field(default_factory=list)


class DiagnosticoAlternativaResult(BaseModel):
    enfermedad: str
    confianza: float = Field(ge=0, le=100)


class DiagnosticoAlternativaOut(BaseModel):
    enfermedad: str
    confianza_pct: Decimal | None = None
    orden: int

    model_config = ConfigDict(from_attributes=True)


class DiagnosticoOut(BaseModel):
    id: UUID
    cultivo_id: UUID | None = None
    parte_planta: str | None = None
    resultado: str | None = None
    nombre_cientifico: str | None = None
    modelo: str | None = None
    confianza: Decimal | None = None
    guardado: bool = False
    imagen: str | None = None
    recomendacion: str | None = None
    fecha: datetime
    alternativas: list[DiagnosticoAlternativaOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


DiagnosticoResult.model_rebuild()
