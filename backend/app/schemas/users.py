import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import clean_text

UserRole = Literal["productor", "consumidor", "admin"]

# Teléfono móvil de Perú: 9 dígitos, empieza en 9.
_PHONE_RE = re.compile(r"^9\d{8}$")


def _normalize_phone(value: str | None) -> str | None:
    """Deja solo dígitos; valida formato peruano (9 + 8 dígitos). Vacío → None."""
    if value is None:
        return None
    digits = re.sub(r"\D", "", str(value))
    if digits == "":
        return None
    if not _PHONE_RE.match(digits):
        raise ValueError("El teléfono debe tener 9 dígitos y empezar en 9")
    return digits


class _PhoneMixin(BaseModel):
    @field_validator("telefono", mode="before", check_fields=False)
    @classmethod
    def _check_phone(cls, value: str | None) -> str | None:
        return _normalize_phone(value)


class UserCreate(_PhoneMixin):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    nombre: str = Field(min_length=2, max_length=160)
    rol: UserRole = "productor"
    telefono: str | None = Field(default=None, max_length=40)
    direccion: str | None = Field(default=None, max_length=240)
    latitud: float | None = Field(default=None, ge=-90, le=90)
    longitud: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("nombre", "direccion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserUpdate(_PhoneMixin):
    nombre: str | None = Field(default=None, min_length=2, max_length=160)
    telefono: str | None = Field(default=None, max_length=40)
    direccion: str | None = Field(default=None, max_length=240)
    latitud: float | None = Field(default=None, ge=-90, le=90)
    longitud: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("nombre", "direccion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class UserAdminUpdate(_PhoneMixin):
    is_active: bool | None = None
    rol: UserRole | None = None
    nombre: str | None = Field(default=None, min_length=2, max_length=160)
    telefono: str | None = Field(default=None, max_length=40)
    direccion: str | None = Field(default=None, max_length=240)
    latitud: float | None = Field(default=None, ge=-90, le=90)
    longitud: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("nombre", "direccion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    nombre: str
    rol: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    telefono: str | None = None
    direccion: str | None = None
    latitud: float | None = None
    longitud: float | None = None

    model_config = ConfigDict(from_attributes=True)


class CurrentUser(BaseModel):
    id: int
    email: EmailStr
    nombre: str
    rol: UserRole
    is_active: bool


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: UserOut
