from datetime import datetime

from pydantic import BaseModel


class RagFuenteOut(BaseModel):
    fuente: str
    chunks: int
    primer_chunk: datetime
    ultimo_chunk: datetime


class RagStatusOut(BaseModel):
    total_chunks: int
    total_fuentes: int
    embedding_model: str
    llm_model: str
    conversor_pdf: str
    upload_max_mb: int
    fuentes: list[RagFuenteOut]


class RagIngestOut(BaseModel):
    fuente: str
    filename: str
    markdown_chars: int
    chunks: int
    replaced: bool
    message: str


class RagDeleteOut(BaseModel):
    fuente: str
    deleted_chunks: int
    message: str
