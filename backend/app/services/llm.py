"""Clientes HTTP para los servicios de IA en la nube.

- OpenRouter: chat completions (texto y vision) para diagnostico y recomendaciones.
- OpenAI: embeddings para el RAG (pgvector).
"""

import json
import logging
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings"


def extract_json(raw: str) -> dict[str, Any]:
    """Extrae el primer objeto JSON de la respuesta del modelo (tolera ```json ...```)."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.removeprefix("json").strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end >= start:
        cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


async def openrouter_chat_json(
    *,
    model: str,
    system: str,
    user_content: Any,
    timeout: float = 90,
) -> dict[str, Any]:
    """Llama a OpenRouter y devuelve la respuesta parseada como JSON.

    `user_content` puede ser un string (solo texto) o una lista de partes
    multimodales ({"type": "text", ...} / {"type": "image_url", ...}).
    """
    settings = get_settings()
    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY no configurada")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "response_format": {"type": "json_object"},
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            OPENROUTER_CHAT_URL,
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
    content = data["choices"][0]["message"]["content"]
    if not content:
        raise ValueError("La respuesta de OpenRouter no contiene texto util.")
    return extract_json(content)


async def openai_embed(texts: list[str]) -> list[list[float]]:
    """Genera embeddings con la API de OpenAI para una lista de textos."""
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY no configurada")

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            OPENAI_EMBEDDINGS_URL,
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={"model": settings.openai_embed_model, "input": texts},
        )
        response.raise_for_status()
        data = response.json()
    ordered = sorted(data["data"], key=lambda item: item["index"])
    return [item["embedding"] for item in ordered]
