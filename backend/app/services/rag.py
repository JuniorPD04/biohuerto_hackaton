"""RAG (Retrieval-Augmented Generation) para recomendaciones de manejo.

Usa Ollama (embeddings + LLM local) y pgvector para recuperar fragmentos
relevantes de la guia FAO/IPES "Biopreparados para el manejo sostenible de
plagas y enfermedades en la agricultura urbana y periurbana" (2010) y generar
una recomendacion de manejo organico para el problema detectado por el modelo
de diagnostico.
"""

import json
import logging
import time
from collections.abc import Callable
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas.diagnostico import DiagnosticoResult

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


async def _embed(client: httpx.AsyncClient, text_input: str) -> list[float]:
    settings = get_settings()
    response = await client.post(
        f"{settings.ollama_url}/api/embeddings",
        json={"model": settings.ollama_embed_model, "prompt": text_input},
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["embedding"]


async def ensure_ingested(session_factory: Callable[[], AsyncSession]) -> None:
    """Carga la guia FAO en `rag_chunks` la primera vez que arranca el backend."""
    async with session_factory() as session:
        existing = await session.execute(text("select count(*) from rag_chunks"))
        if existing.scalar_one() > 0:
            return

    if not DOC_PATH.exists():
        logger.warning("RAG: documento %s no encontrado, se omite la ingesta", DOC_PATH)
        return

    chunks = _chunk_text(DOC_PATH.read_text(encoding="utf-8"))
    logger.info("RAG: ingiriendo %d fragmentos de %s", len(chunks), DOC_PATH.name)

    async with httpx.AsyncClient() as client:
        for idx, chunk in enumerate(chunks):
            try:
                embedding = await _embed(client, chunk)
            except (httpx.HTTPError, KeyError) as exc:
                logger.warning(
                    "RAG: fallo embebiendo fragmento %d/%d (%s); se reintentara en el proximo arranque",
                    idx,
                    len(chunks),
                    exc,
                )
                return
            async with session_factory() as session:
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


async def _retrieve(session: AsyncSession, query: str) -> list[str]:
    async with httpx.AsyncClient() as client:
        try:
            embedding = await _embed(client, query)
        except (httpx.HTTPError, KeyError) as exc:
            logger.warning("RAG: fallo generando embedding de consulta: %s", exc)
            return []

    result = await session.execute(
        text(
            """
            select contenido
            from rag_chunks
            order by embedding <=> (:embedding)::vector
            limit :top_k
            """
        ),
        {"embedding": _vector_literal(embedding), "top_k": TOP_K},
    )
    return [row[0] for row in result.all()]


async def generar_recomendacion(session: AsyncSession, result: DiagnosticoResult) -> tuple[str, list[str]]:
    """Devuelve (recomendacion, acciones) usando RAG + Ollama, o ("", []) si no aplica/falla."""
    if result.es_sano:
        return "", []

    query = f"Enfermedad de la planta: {result.problema}"
    if result.nombre_cientifico:
        query = f"{query} ({result.nombre_cientifico})"
    query += (
        ". Biofungicida o bioantibacteriano organico para controlar esta enfermedad "
        "fungica o bacteriana en las hojas del cultivo, manejo preventivo y curativo."
    )

    chunks = await _retrieve(session, query)
    if not chunks:
        return "", []

    contexto = "\n\n".join(f"- {c}" for c in chunks)
    prompt = (
        f"PROBLEMA DETECTADO: {result.problema}\n"
        + (f"NOMBRE CIENTIFICO: {result.nombre_cientifico}\n" if result.nombre_cientifico else "")
        + f"\nCONTEXTO (fragmentos de la guia FAO/IPES de biopreparados, pueden no ser todos relevantes):\n{contexto}\n\n"
        + "Da una recomendacion de manejo organico/biopreparado para este problema, siguiendo las "
        + "instrucciones del sistema sobre cuando usar el contexto y cuando usar tu propio conocimiento."
    )

    settings = get_settings()
    started = time.perf_counter()
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": settings.ollama_llm_model,
                    "system": SYSTEM_PROMPT,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
                timeout=240,
            )
            response.raise_for_status()
            data = json.loads(response.json()["response"])
        except (httpx.HTTPError, KeyError, json.JSONDecodeError) as exc:
            logger.warning(
                "RAG: fallo generando recomendacion con Ollama tras %.1fs: %s",
                time.perf_counter() - started,
                exc,
            )
            return "", []
    logger.info(
        "RAG: recomendacion de diagnostico generada con %s en %.1fs",
        settings.ollama_llm_model,
        time.perf_counter() - started,
    )

    recomendacion = str(data.get("recomendacion") or "").strip()
    acciones = [str(a).strip() for a in data.get("acciones") or [] if str(a).strip()]
    return recomendacion, acciones


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

    settings = get_settings()
    started = time.perf_counter()
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": settings.ollama_llm_model,
                    "system": SYSTEM_PROMPT_CUIDADO,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
                timeout=240,
            )
            response.raise_for_status()
            data = json.loads(response.json()["response"])
        except (httpx.HTTPError, KeyError, json.JSONDecodeError) as exc:
            logger.warning(
                "RAG: fallo generando recomendacion de cuidado general con Ollama tras %.1fs: %s",
                time.perf_counter() - started,
                exc,
            )
            return "", []
    logger.info(
        "RAG: recomendacion de cuidado para '%s' generada con %s en %.1fs",
        cultivo_label,
        settings.ollama_llm_model,
        time.perf_counter() - started,
    )

    recomendacion = str(data.get("recomendacion") or "").strip()
    acciones = [str(a).strip() for a in data.get("acciones") or [] if str(a).strip()]
    return recomendacion, acciones
