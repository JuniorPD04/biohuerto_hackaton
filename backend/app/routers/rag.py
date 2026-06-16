import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.database import get_session
from app.dependencies import require_role
from app.schemas.rag import RagDeleteOut, RagFuenteOut, RagIngestOut, RagStatusOut
from app.schemas.users import CurrentUser
from app.services.rag import (
    RagConversionError,
    RagSourceExistsError,
    ingest_markdown_document,
    markdown_from_pdf_bytes,
    normalize_fuente,
)

router = APIRouter(prefix="/api/rag", tags=["rag"])


async def _read_pdf_body(request: Request, limit_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"El PDF supera el limite de {limit_bytes // (1024 * 1024)} MB.",
            )
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo esta vacio.")
    return data


@router.get("/status", response_model=RagStatusOut)
async def get_rag_status(
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> RagStatusOut:
    settings = get_settings()
    result = await session.execute(
        text(
            """
            select fuente,
                   count(*)::int as chunks,
                   min(created_at) as primer_chunk,
                   max(created_at) as ultimo_chunk
            from rag_chunks
            group by fuente
            order by max(created_at) desc, fuente asc
            """
        )
    )
    fuentes = [RagFuenteOut.model_validate(dict(row)) for row in result.mappings().all()]
    total_chunks = sum(item.chunks for item in fuentes)
    return RagStatusOut(
        total_chunks=total_chunks,
        total_fuentes=len(fuentes),
        embedding_model=settings.openai_embed_model,
        llm_model=settings.openrouter_model_text,
        conversor_pdf="Microsoft MarkItDown",
        upload_max_mb=settings.rag_upload_max_mb,
        fuentes=fuentes,
    )


@router.post("/documentos", response_model=RagIngestOut, status_code=status.HTTP_201_CREATED)
async def ingest_rag_document(
    request: Request,
    filename: str = Query(min_length=1, max_length=255),
    fuente: str | None = Query(default=None, max_length=200),
    reemplazar: bool = Query(default=False),
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> RagIngestOut:
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OPENAI_API_KEY no esta configurada para generar embeddings.",
        )

    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type not in {"application/pdf", "application/octet-stream"} and not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Solo se aceptan archivos PDF.")

    limit_bytes = settings.rag_upload_max_mb * 1024 * 1024
    pdf_bytes = await _read_pdf_body(request, limit_bytes)
    if not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo no parece ser un PDF valido.")

    fuente_label = normalize_fuente(fuente, filename)
    try:
        markdown = await run_in_threadpool(markdown_from_pdf_bytes, pdf_bytes)
        chunks, replaced = await ingest_markdown_document(
            session,
            fuente=fuente_label,
            markdown=markdown,
            replace=reemplazar,
        )
        await session.commit()
    except RagSourceExistsError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except RagConversionError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except (RuntimeError, httpx.HTTPError, KeyError, IndexError) as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo completar la ingesta RAG. Revisa MarkItDown y la clave de embeddings.",
        ) from exc

    return RagIngestOut(
        fuente=fuente_label,
        filename=filename,
        markdown_chars=len(markdown),
        chunks=chunks,
        replaced=replaced,
        message="Documento convertido a Markdown y vectorizado en pgvector.",
    )


@router.delete("/fuentes", response_model=RagDeleteOut)
async def delete_rag_source(
    fuente: str = Query(min_length=1, max_length=200),
    current_user: CurrentUser = Depends(require_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> RagDeleteOut:
    source = normalize_fuente(fuente)
    existing = await session.execute(
        text("select count(*) from rag_chunks where fuente = :fuente"),
        {"fuente": source},
    )
    deleted_chunks = existing.scalar_one()
    if deleted_chunks == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente RAG no encontrada.")

    await session.execute(text("delete from rag_chunks where fuente = :fuente"), {"fuente": source})
    await session.commit()
    return RagDeleteOut(
        fuente=source,
        deleted_chunks=deleted_chunks,
        message="Fuente RAG eliminada de pgvector.",
    )
