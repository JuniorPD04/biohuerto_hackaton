"""Diagnóstico fitosanitario por imagen usando un modelo de visión vía OpenRouter.

El modelo identifica primero la especie de la planta (adaptado a cultivos
frecuentes de Lambayeque/Chiclayo, Perú) y luego evalúa si presenta alguna
enfermedad o plaga, devolviendo el diagnóstico principal y alternativas.
"""

import logging

import httpx

from app.config import get_settings
from app.schemas.diagnostico import DiagnosticoAlternativaResult, DiagnosticoResult
from app.services.llm import openrouter_chat_json

logger = logging.getLogger(__name__)

# Top-1 + alternativas a devolver.
TOP_K_ALTERNATIVAS = 2

SYSTEM_PROMPT_VISION = (
    "Eres un ingeniero agronomo fitopatologo experto en cultivos de la costa norte "
    "del Peru, especificamente del departamento de Lambayeque (Chiclayo). Analizas "
    "fotos de plantas de biohuertos urbanos y comunitarios.\n\n"
    "Cultivos frecuentes en la zona (no es una lista cerrada): tomate, aji, papaya, "
    "maiz, lechuga, culantro, rabanito, zapallo loche, cebolla china, albahaca, "
    "espinaca, camote, yuca, frijol caupi, mango, limon sutil, maracuya, platano, "
    "palta, hierbas aromaticas.\n\n"
    "Tu tarea con cada foto:\n"
    "1. Identifica la especie de la planta con su nombre comun en espanol peruano. "
    "Se cuidadoso: no confundas especies (por ejemplo, una papaya NO es una coliflor). "
    "Si la imagen no muestra una planta, indicalo.\n"
    "2. Evalua su estado sanitario: si esta sana o si presenta una enfermedad "
    "(hongo, bacteria, virus), plaga o deficiencia visible.\n"
    "3. Si detectas un problema, da el diagnostico mas probable y hasta "
    f"{TOP_K_ALTERNATIVAS} diagnosticos alternativos plausibles.\n\n"
    "Responde SOLO con JSON valido con este formato exacto:\n"
    "{\n"
    '  "es_planta": true,\n'
    '  "planta": "nombre comun de la especie",\n'
    '  "es_sano": false,\n'
    '  "problema": "nombre del problema en espanol, o \'Planta sana\' si esta sana",\n'
    '  "nombre_cientifico": "nombre cientifico del patogeno/plaga o null",\n'
    '  "nivel_riesgo": "bajo|medio|alto" (null si esta sana),\n'
    '  "confianza": 0-100,\n'
    '  "alternativas": [{"enfermedad": "diagnostico alternativo", "confianza": 0-100}]\n'
    "}"
)


class ImagenSinPlantaError(ValueError):
    """La imagen enviada no parece contener una planta."""


def _to_result(data: dict) -> DiagnosticoResult:
    if not data.get("es_planta", True):
        raise ImagenSinPlantaError("La imagen no parece contener una planta.")

    planta = str(data.get("planta") or "").strip() or "Planta no identificada"
    es_sano = bool(data.get("es_sano"))
    problema = str(data.get("problema") or "").strip()

    # Se conserva el formato histórico "Problema (Cultivo)" que usa el frontend
    # y el chequeo startswith("Planta sana") del router de diagnóstico.
    if es_sano or not problema or problema.lower().startswith("planta sana"):
        descripcion = f"Planta sana ({planta})"
        es_sano = True
        nombre_cientifico = None
        nivel_riesgo = None
    else:
        descripcion = f"{problema} ({planta})"
        nombre_cientifico = (str(data.get("nombre_cientifico") or "").strip() or None)
        nivel_riesgo = data.get("nivel_riesgo") if data.get("nivel_riesgo") in ("bajo", "medio", "alto") else None

    try:
        confianza = max(0, min(100, int(round(float(data.get("confianza", 70))))))
    except (TypeError, ValueError):
        confianza = 70

    alternativas = []
    for alt in (data.get("alternativas") or [])[:TOP_K_ALTERNATIVAS]:
        enfermedad = str(alt.get("enfermedad") or "").strip() if isinstance(alt, dict) else ""
        if not enfermedad:
            continue
        try:
            alt_conf = max(0.0, min(100.0, round(float(alt.get("confianza", 0)), 1)))
        except (TypeError, ValueError):
            alt_conf = 0.0
        alternativas.append(DiagnosticoAlternativaResult(enfermedad=enfermedad, confianza=alt_conf))

    return DiagnosticoResult(
        problema=descripcion,
        nombre_cientifico=nombre_cientifico,
        nivel_riesgo=nivel_riesgo,
        confianza=confianza,
        alternativas=alternativas,
        es_sano=es_sano,
    )


async def diagnosticar_imagen(image_base64: str, mime_type: str) -> tuple[DiagnosticoResult, str]:
    """Identifica la planta y diagnostica su estado sanitario con el modelo de visión.

    Lanza `ImagenSinPlantaError` si la foto no contiene una planta y
    `RuntimeError`/`httpx.HTTPError` si el servicio de IA no está disponible.
    """
    settings = get_settings()
    data_url = f"data:{mime_type};base64,{image_base64}"
    try:
        data = await openrouter_chat_json(
            model=settings.openrouter_model_vision,
            system=SYSTEM_PROMPT_VISION,
            user_content=[
                {
                    "type": "text",
                    "text": (
                        "Identifica la planta de la foto y diagnostica su estado "
                        "sanitario. Responde solo el JSON indicado."
                    ),
                },
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
            timeout=90,
        )
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        logger.warning("Diagnóstico por imagen: fallo llamando a OpenRouter: %s", exc)
        raise RuntimeError("El servicio de diagnóstico por imagen no está disponible.") from exc

    return _to_result(data), settings.openrouter_model_vision
