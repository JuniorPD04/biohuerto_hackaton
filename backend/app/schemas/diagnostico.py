from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_text

NivelRiesgo = Literal["bajo", "medio", "alto"]
ModalidadDiagnostico = Literal["guiado", "imagen"]


class DiagnosticoGuiadoCreate(BaseModel):
    biohuerto_id: int | None = None
    cultivo_id: UUID | None = None
    especie: str = Field(min_length=2, max_length=120)
    sintomas: list[str] = Field(min_length=1, max_length=12)
    zona_afectada: str | None = Field(default=None, max_length=120)
    tiempo_dias: int | None = Field(default=None, ge=0, le=365)

    @field_validator("especie", "zona_afectada", mode="before")
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
    biohuerto_id: int | None = None
    cultivo_id: UUID | None = None
    especie: str = Field(min_length=2, max_length=120)
    image_base64: str = Field(min_length=64)
    mime_type: str = Field(default="image/jpeg", pattern="^image/(jpeg|jpg|png|webp)$")
    sintomas: list[str] = Field(default_factory=list, max_length=12)
    zona_afectada: str | None = Field(default=None, max_length=120)
    tiempo_dias: int | None = Field(default=None, ge=0, le=365)

    @field_validator("especie", "zona_afectada", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class DiagnosticoResult(BaseModel):
    problema: str
    nivel_riesgo: NivelRiesgo
    recomendacion: str
    acciones: list[str] = Field(default_factory=list)
    confianza: int = Field(default=70, ge=0, le=100)


class DiagnosticoOut(BaseModel):
    id: UUID
    biohuerto_id: int | None
    cultivo_id: UUID | None
    user_id: int | None
    modalidad: ModalidadDiagnostico
    especie: str
    sintomas: list[str]
    zona_afectada: str | None
    tiempo_dias: int | None
    resultado_nombre: str | None
    nivel_riesgo: NivelRiesgo | None
    recomendacion_resumen: str | None
    modelo_usado: str | None
    is_synced: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

