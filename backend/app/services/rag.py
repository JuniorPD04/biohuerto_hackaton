"""RAG (Retrieval-Augmented Generation) para recomendaciones de manejo.

Usa OpenAI (embeddings) + pgvector para recuperar fragmentos relevantes de la
guia FAO/IPES "Biopreparados para el manejo sostenible de plagas y enfermedades
en la agricultura urbana y periurbana" (2010), y OpenRouter (LLM) para generar
una recomendacion de manejo organico para el problema detectado por el modelo
de diagnostico.
"""

import json
import logging
import io
import re
import time
from collections.abc import Callable
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas.diagnostico import DiagnosticoResult
from app.services.llm import openai_embed, openrouter_chat_json

logger = logging.getLogger(__name__)

DOC_PATH = Path(__file__).resolve().parent.parent / "data" / "fao_biopreparados.md"
FUENTE = (
    "FAO/IPES - Biopreparados para el manejo sostenible de plagas y "
    "enfermedades en la agricultura urbana y periurbana (2010)"
)

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150
TOP_K = 8
MIN_PARAGRAPH_LEN = 20
EMBED_BATCH_SIZE = 64
FUENTE_MAX_LEN = 200
FUENTES_MARKER = "Fuentes consultadas:"


class RagSourceExistsError(ValueError):
    """La fuente ya existe y la ingesta no pidio reemplazarla."""


class RagConversionError(ValueError):
    """El documento no pudo convertirse a Markdown util."""

SYSTEM_PROMPT_CUIDADO = (
    "Eres un agronomo especialista en agricultura ecologica y biohuertos urbanos del "
    "departamento de Lambayeque, Peru. Solo debes recomendar manejo organico, biologico "
    "y practicas culturales tradicionales. NUNCA recomiendes agroquimicos sinteticos. "
    "Responde en espanol peruano, claro y accesible para pequenos productores "
    "comunitarios.\n\n"
    "Se te dara el nombre de un cultivo (especie, opcionalmente variedad y etapa "
    "fenologica actual) que NO tiene ninguna enfermedad ni plaga detectada. Da una "
    "recomendacion general y preventiva de como cuidarlo bien: riego, abonamiento "
    "organico, exposicion solar, plagas/enfermedades comunes a vigilar de forma "
    "preventiva, y buenas practicas culturales para esa especie.\n\n"
    'Responde SOLO con JSON valido del formato: {"recomendacion": "texto breve", '
    '"acciones": ["accion 1", "accion 2"]}'
)

SYSTEM_PROMPT = (
    "Eres un agronomo especialista en agricultura ecologica y biohuertos urbanos del "
    "departamento de Lambayeque, Peru. Solo debes recomendar manejo organico, biologico "
    "y biopreparados artesanales. NUNCA recomiendes agroquimicos sinteticos. Responde "
    "en espanol peruano, claro y accesible para pequenos productores comunitarios.\n\n"
    "Se te dara un PROBLEMA DETECTADO (siempre es una enfermedad: hongo, bacteria o "
    "virus, NUNCA una plaga de insectos) y un CONTEXTO con fragmentos de una guia "
    "FAO/IPES de biopreparados.\n\n"
    "Primero evalua cada fragmento del CONTEXTO: usa SOLO los que sean biofungicidas, "
    "bioantibacterianos, bioestimulantes o de manejo preventivo de enfermedades y que "
    "tengan sentido para el PROBLEMA DETECTADO. IGNORA por completo cualquier fragmento "
    "etiquetado o enfocado como 'Insecticida botanico', 'repelente de insectos' u otro "
    "control de plagas de insectos/acaros, ya que NO sirven para una enfermedad fungica, "
    "bacteriana o viral.\n\n"
    "Si encuentras en el CONTEXTO un biopreparado relevante (tras el filtro anterior), "
    "basa tu recomendacion en el. Si NINGUN fragmento del CONTEXTO es relevante para el "
    "PROBLEMA DETECTADO, no fuerces su uso: en su lugar, usa tu propio conocimiento "
    "agronomico para dar una recomendacion organica breve, coherente con el cultivo y la "
    "enfermedad detectados (por ejemplo practicas culturales, poda sanitaria, mejorar "
    "ventilacion/riego, o un biopreparado conocido aunque no este en el CONTEXTO).\n\n"
    'Responde SOLO con JSON valido del formato: {"recomendacion": "texto breve", '
    '"acciones": ["accion 1", "accion 2"]}'
)


def _chunk_text(raw: str) -> list[str]:
    paragraphs: list[str] = []
    for block in raw.split("\n\n"):
        cleaned = " ".join(line.strip() for line in block.splitlines() if line.strip())
        if len(cleaned) >= MIN_PARAGRAPH_LEN:
            paragraphs.append(cleaned)

    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if current and len(current) + len(para) + 1 > CHUNK_SIZE:
            chunks.append(current)
            current = (current[-CHUNK_OVERLAP:] + " " + para).strip()
        else:
            current = f"{current} {para}".strip()
    if current:
        chunks.append(current)
    return chunks


def _vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(repr(float(x)) for x in embedding) + "]"


def normalize_fuente(value: str | None, filename: str | None = None) -> str:
    fallback = Path(filename or "documento-rag.pdf").stem or "Documento RAG"
    candidate = value or fallback
    candidate = re.sub(r"[\x00-\x1f]", "", candidate)
    candidate = " ".join(candidate.replace("\\", " ").replace("/", " ").split())
    if not candidate:
        candidate = fallback
    return candidate[:FUENTE_MAX_LEN].strip()


def markdown_from_pdf_bytes(pdf_bytes: bytes) -> str:
    """Convierte PDF a Markdown con MarkItDown sin persistir el archivo."""
    try:
        from markitdown import MarkItDown
    except ImportError as exc:
        raise RuntimeError(
            "MarkItDown no esta instalado. Ejecuta pip install -r backend/requirements.txt."
        ) from exc

    try:
        result = MarkItDown(enable_plugins=False).convert_stream(
            io.BytesIO(pdf_bytes),
            file_extension=".pdf",
        )
    except Exception as exc:
        raise RagConversionError("No se pudo convertir el PDF a Markdown.") from exc

    markdown = (getattr(result, "text_content", None) or getattr(result, "markdown", "") or "").strip()
    if len(markdown) < MIN_PARAGRAPH_LEN:
        raise RagConversionError("El PDF no contiene texto suficiente para vectorizar.")
    return markdown


async def ingest_markdown_document(
    session: AsyncSession,
    *,
    fuente: str,
    markdown: str,
    replace: bool,
) -> tuple[int, bool]:
    """Vectoriza Markdown y lo guarda en rag_chunks. Devuelve (chunks, replaced)."""
    chunks = _chunk_text(markdown)
    if not chunks:
        raise RagConversionError("El Markdown no genero fragmentos utiles para RAG.")

    existing = await session.execute(
        text("select count(*) from rag_chunks where fuente = :fuente"),
        {"fuente": fuente},
    )
    existing_count = existing.scalar_one()
    if existing_count > 0 and not replace:
        raise RagSourceExistsError("Ya existe una fuente RAG con ese nombre.")

    embeddings: list[list[float]] = []
    for start in range(0, len(chunks), EMBED_BATCH_SIZE):
        batch = chunks[start : start + EMBED_BATCH_SIZE]
        embeddings.extend(await openai_embed(batch))

    if len(embeddings) != len(chunks):
        raise RuntimeError("La cantidad de embeddings no coincide con los fragmentos generados.")

    if existing_count > 0:
        await session.execute(text("delete from rag_chunks where fuente = :fuente"), {"fuente": fuente})

    for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        await session.execute(
            text(
                """
                insert into rag_chunks (fuente, chunk_index, contenido, embedding)
                values (:fuente, :idx, :contenido, (:embedding)::vector)
                """
            ),
            {
                "fuente": fuente,
                "idx": idx,
                "contenido": chunk,
                "embedding": _vector_literal(embedding),
            },
        )
    return len(chunks), existing_count > 0


async def ensure_ingested(session_factory: Callable[[], AsyncSession]) -> None:
    """Carga la guia FAO en `rag_chunks` la primera vez que arranca el backend."""
    settings = get_settings()
    if not settings.openai_api_key:
        logger.warning("RAG: OPENAI_API_KEY no configurada, se omite la ingesta")
        return

    async with session_factory() as session:
        existing = await session.execute(
            text("select count(*) from rag_chunks where fuente = :fuente"),
            {"fuente": FUENTE},
        )
        if existing.scalar_one() > 0:
            return

    if not DOC_PATH.exists():
        logger.warning("RAG: documento %s no encontrado, se omite la ingesta", DOC_PATH)
        return

    chunks = _chunk_text(DOC_PATH.read_text(encoding="utf-8"))
    logger.info("RAG: ingiriendo %d fragmentos de %s", len(chunks), DOC_PATH.name)

    embeddings: list[list[float]] = []
    for start in range(0, len(chunks), EMBED_BATCH_SIZE):
        batch = chunks[start : start + EMBED_BATCH_SIZE]
        try:
            embeddings.extend(await openai_embed(batch))
        except (httpx.HTTPError, RuntimeError, KeyError) as exc:
            logger.warning(
                "RAG: fallo embebiendo lote %d-%d (%s); se reintentara en el proximo arranque",
                start,
                start + len(batch),
                exc,
            )
            return

    async with session_factory() as session:
        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            await session.execute(
                text(
                    """
                    insert into rag_chunks (fuente, chunk_index, contenido, embedding)
                    values (:fuente, :idx, :contenido, (:embedding)::vector)
                    """
                ),
                {
                    "fuente": FUENTE,
                    "idx": idx,
                    "contenido": chunk,
                    "embedding": _vector_literal(embedding),
                },
            )
        await session.commit()

    logger.info("RAG: ingesta completa (%d fragmentos)", len(chunks))


async def _retrieve(session: AsyncSession, query: str) -> list[dict[str, str]]:
    try:
        embedding = (await openai_embed([query]))[0]
    except (httpx.HTTPError, RuntimeError, KeyError, IndexError) as exc:
        logger.warning("RAG: fallo generando embedding de consulta: %s", exc)
        return []

    result = await session.execute(
        text(
            """
            select fuente, contenido
            from rag_chunks
            order by embedding <=> (:embedding)::vector
            limit :top_k
            """
        ),
        {"embedding": _vector_literal(embedding), "top_k": TOP_K},
    )
    return [{"fuente": row[0], "contenido": row[1]} for row in result.all()]


async def _generar_json(*, system: str, prompt: str, contexto_log: str) -> tuple[str, list[str]]:
    """Llama al LLM de OpenRouter y devuelve (recomendacion, acciones) o ("", []) si falla."""
    settings = get_settings()
    started = time.perf_counter()
    try:
        data = await openrouter_chat_json(
            model=settings.openrouter_model_text,
            system=system,
            user_content=prompt,
            timeout=120,
        )
    except (httpx.HTTPError, RuntimeError, KeyError, IndexError, ValueError, json.JSONDecodeError) as exc:
        logger.warning(
            "RAG: fallo generando %s con OpenRouter tras %.1fs: %s",
            contexto_log,
            time.perf_counter() - started,
            exc,
        )
        return "", []

    logger.info(
        "RAG: %s generada con %s en %.1fs",
        contexto_log,
        settings.openrouter_model_text,
        time.perf_counter() - started,
    )
    recomendacion = str(data.get("recomendacion") or "").strip()
    acciones = [str(a).strip() for a in data.get("acciones") or [] if str(a).strip()]
    return recomendacion, acciones


async def generar_recomendacion(session: AsyncSession, result: DiagnosticoResult) -> tuple[str, list[str], list[str]]:
    """Devuelve (recomendacion, acciones, fuentes) usando RAG + OpenRouter."""
    if result.es_sano:
        return "", [], []

    query = f"Enfermedad de la planta: {result.problema}"
    if result.nombre_cientifico:
        query = f"{query} ({result.nombre_cientifico})"
    query += (
        ". Biofungicida o bioantibacteriano organico para controlar esta enfermedad "
        "fungica o bacteriana en las hojas del cultivo, manejo preventivo y curativo."
    )

    chunks = await _retrieve(session, query)
    if not chunks:
        return "", [], []

    fuentes = sorted({chunk["fuente"] for chunk in chunks if chunk["fuente"]})
    contexto = "\n\n".join(
        f"- Fuente: {chunk['fuente']}\n  Fragmento: {chunk['contenido']}" for chunk in chunks
    )
    prompt = (
        f"PROBLEMA DETECTADO: {result.problema}\n"
        + (f"NOMBRE CIENTIFICO: {result.nombre_cientifico}\n" if result.nombre_cientifico else "")
        + f"\nCONTEXTO (fragmentos de la guia FAO/IPES de biopreparados, pueden no ser todos relevantes):\n{contexto}\n\n"
        + "Da una recomendacion de manejo organico/biopreparado para este problema, siguiendo las "
        + "instrucciones del sistema sobre cuando usar el contexto y cuando usar tu propio conocimiento."
    )

    recomendacion, acciones = await _generar_json(
        system=SYSTEM_PROMPT,
        prompt=prompt,
        contexto_log="recomendacion de diagnostico",
    )
    return recomendacion, acciones, fuentes


async def generar_recomendacion_cultivo(
    *, especie: str, variedad: str | None = None, etapa_nombre: str | None = None
) -> tuple[str, list[str]]:
    """Devuelve (recomendacion, acciones) de cuidado general para un cultivo sin
    enfermedad/plaga detectada, usando el LLM directamente (sin RAG)."""
    cultivo_label = especie
    if variedad:
        cultivo_label = f"{cultivo_label} ({variedad})"

    prompt = f"CULTIVO: {cultivo_label}\n"
    if etapa_nombre:
        prompt += f"ETAPA ACTUAL: {etapa_nombre}\n"
    prompt += (
        "\nEste cultivo no presenta ninguna enfermedad ni plaga detectada. Da una "
        "recomendacion de cuidado general y preventivo para mantenerlo sano, "
        "siguiendo las instrucciones del sistema."
    )

    return await _generar_json(
        system=SYSTEM_PROMPT_CUIDADO,
        prompt=prompt,
        contexto_log=f"recomendacion de cuidado para '{cultivo_label}'",
    )
