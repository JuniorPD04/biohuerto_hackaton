from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RecomendacionOut(BaseModel):
    id: int
    diagnostico_id: UUID | None
    cultivo_id: UUID | None
    titulo: str
    cuerpo: str
    categoria: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

