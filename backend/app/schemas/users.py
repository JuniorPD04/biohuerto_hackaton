from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import clean_text

UserRole = Literal["productor", "consumidor", "admin"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    nombre: str = Field(min_length=2, max_length=160)
    rol: UserRole = "productor"
    telefono: str | None = Field(default=None, max_length=40)
    direccion: str | None = Field(default=None, max_length=240)

    @field_validator("nombre", "telefono", "direccion", mode="before")
    @classmethod
    def sanitize_text(cls, value: str | None) -> str | None:
        return clean_text(value)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=2, max_length=160)
    telefono: str | None = Field(default=None, max_length=40)
    direccion: str | None = Field(default=None, max_length=240)

    @field_validator("nombre", "telefono", "direccion", mode="before")
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

