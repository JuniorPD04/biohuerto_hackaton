from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

SyncEntity = Literal[
    "biohuertos",
    "cultivos",
    "monitoreo_registros",
    "incidencias",
    "cuidados",
    "practicas_agricolas",
    "costos_produccion",
    "cosechas",
]
SyncAction = Literal["create", "update", "delete"]


class SyncOperation(BaseModel):
    operation_id: UUID
    device_id: UUID
    entity: SyncEntity
    action: SyncAction
    record_id: UUID
    base_version: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    client_updated_at: datetime


class SyncRequest(BaseModel):
    device_id: UUID
    cursor: int = Field(default=0, ge=0)
    operations: list[SyncOperation] = Field(default_factory=list, max_length=50)


class SyncResult(BaseModel):
    operation_id: UUID
    entity: SyncEntity
    record_id: UUID
    status: Literal["applied", "duplicate", "conflict", "rejected"]
    server_version: int | None = None
    record: dict[str, Any] | None = None
    server_record: dict[str, Any] | None = None
    error: str | None = None


class SyncChange(BaseModel):
    entity: SyncEntity
    record_id: UUID
    server_version: int
    deleted: bool = False
    record: dict[str, Any] | None = None


class SyncResponse(BaseModel):
    results: list[SyncResult]
    changes: list[SyncChange]
    next_cursor: int
    has_more: bool = False


class SyncBootstrapResponse(BaseModel):
    cursor: int
    entities: dict[str, list[dict[str, Any]]]
    catalogs: dict[str, list[dict[str, Any]]]
