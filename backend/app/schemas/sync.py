from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

SyncTable = Literal["monitoreo_registros", "incidencias"]


class SyncRegistro(BaseModel):
    tabla: SyncTable
    uuid: UUID
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at_local: datetime


class SyncRequest(BaseModel):
    registros: list[SyncRegistro] = Field(default_factory=list, max_length=100)


class SyncConflict(BaseModel):
    tabla: SyncTable
    uuid: UUID
    reason: str


class SyncResponse(BaseModel):
    sincronizados: int
    conflictos: list[SyncConflict]

