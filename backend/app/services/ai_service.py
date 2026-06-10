import json
import logging
import time
from typing import Any

import httpx

from app.config import get_settings
from app.schemas.diagnostico import DiagnosticoAlternativaResult, DiagnosticoResult

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_AGRO = """Eres un agronomo especialista en agricultura ecologica y biohuertos urbanos del departamento de Lambayeque, Peru.
Solo debes proporcionar recomendaciones de manejo sostenible usando metodos organicos, biologicos y tradicionales.
NUNCA recomiendes agroquimicos sinteticos. Basa tus respuestas en cultivos frecuentes de la region: aji, culantro, lechuga,
rabanito, tomate, zapallo, albahaca, cebolla china, espinaca y hierbas aromaticas locales. Responde en espanol peruano,
en un tono claro y accesible para pequenos productores comunitarios sin formacion tecnica formal."""

SYSTEM_PROMPT_GUIADO = (
    "Eres un agronomo fitopatologo especialista en agricultura ecologica y biohuertos urbanos del "
    "departamento de Lambayeque, Peru. A partir de los SINTOMAS que reporta un pequeno productor, "
    "identificas el problema mas probable (enfermedad fungica/bacteriana/viral, plaga de insectos o "
    "deficiencia nutricional) y das una recomendacion de manejo ORGANICO. NUNCA recomiendes "
    "agroquimicos sinteticos; prioriza biopreparados, control cultural y biologico. Considera cultivos "
    "frecuentes de la region (aji, culantro, lechuga, rabanito, tomate, zapallo, albahaca, cebolla china, "
    "espinaca, hierbas aromaticas). Responde en espanol peruano, claro y accesible.\n\n"
    "Como es un diagnostico por sintomas (sin imagen ni laboratorio), se prudente con la confianza: "
    "usa valores moderados (40-75) y ofrece alternativas. Si los sintomas son muy inespecificos, baja la "
    "confianza.\n\n"
    'Responde SOLO con JSON valido EXACTAMENTE con esta forma: {"problema": "nombre breve del problema", '
    '"nombre_cientifico": "nombre cientifico o null", "nivel_riesgo": "bajo|medio|alto", '
    '"confianza": numero_0_a_100, "recomendacion": "resumen accionable de manejo organico", '
    '"acciones": ["3 a 5 acciones concretas"], '
    '"alternativas": [{"enfermedad": "otro problema posible", "confianza": numero_0_a_100}]}'
)


def _fallback_result(especie: str, sintomas: list[str], zona_afectada: str | None, tiempo_dias: int | None) -> DiagnosticoResult:
    joined = " ".join(sintomas).lower()
    riesgo = "medio"
    problema = "Estres del cultivo por condiciones de manejo"
    acciones = [
        "Revisar humedad del sustrato por la manana antes de regar.",
        "Retirar hojas muy afectadas y disponerlas fuera de la cama de cultivo.",
        "Mejorar ventilacion y evitar mojar el follaje por la tarde.",
    ]

    if any(term in joined for term in ["mancha", "hongo", "moho", "amarill"]):
        problema = "Posible problema fungico foliar inicial"
        acciones = [
            "Retirar hojas afectadas con herramienta limpia.",
            "Aplicar extracto de cola de caballo o biol suave bien diluido.",
            "Regar temprano y evitar humedad nocturna en hojas.",
        ]
        riesgo = "medio" if (tiempo_dias or 0) <= 5 else "alto"
    elif any(term in joined for term in ["insecto", "mordida", "oruga", "pulgon", "plaga"]):
        problema = "Posible presencia de insectos plaga"
        acciones = [
            "Inspeccionar el enves de las hojas y retirar insectos manualmente.",
            "Usar trampas amarillas o preparado jabon potasico suave si corresponde.",
            "Aumentar diversidad con aromaticas cercanas como albahaca o culantro.",
        ]
    elif any(term in joined for term in ["marchit", "seco", "caido"]):
        problema = "Estres hidrico o raiz afectada"
        acciones = [
            "Comprobar humedad a 5 cm de profundidad antes de aumentar riego.",
            "Aplicar acolchado organico para conservar humedad.",
            "Revisar drenaje para evitar encharcamiento.",
        ]

    zona = f" en {zona_afectada}" if zona_afectada else ""
    return DiagnosticoResult(
        problema=f"{problema}{zona}",
        nivel_riesgo=riesgo,
        recomendacion=f"Para {especie}, prioriza manejo organico preventivo: {acciones[0]} {acciones[1]}",
        acciones=acciones,
        confianza=62,
    )


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.removeprefix("json").strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end >= start:
        cleaned = cleaned[start : end + 1]
    return json.loads(cleaned)


async def diagnostico_guiado(
    *,
    especie: str,
    sintomas: list[str],
    zona_afectada: str | None,
    tiempo_dias: int | None,
    parte_planta: str | None = None,
    observaciones: str | None = None,
) -> tuple[DiagnosticoResult, str | None]:
    """Diagnostico por sintomas. Prioriza Ollama (local), luego OpenAI, luego reglas."""
    # 1) Ollama local (llama3.2) — preferente: no requiere claves externas.
    ollama_result = await _diagnostico_guiado_ollama(
        especie=especie,
        parte_planta=parte_planta,
        sintomas=sintomas,
        zona_afectada=zona_afectada,
        tiempo_dias=tiempo_dias,
        observaciones=observaciones,
    )
    if ollama_result is not None:
        return ollama_result, f"{get_settings().ollama_llm_model} (guiado)"

    # 2) OpenAI (si esta configurado).
    settings = get_settings()
    if settings.openai_api_key and settings.openai_model_text:
        user_prompt = {
            "modalidad": "diagnostico_guiado",
            "especie": especie,
            "parte_planta": parte_planta,
            "sintomas": sintomas,
            "zona_afectada": zona_afectada,
            "tiempo_dias": tiempo_dias,
            "observaciones": observaciones,
            "formato_salida": {
                "problema": "nombre breve del problema probable",
                "nivel_riesgo": "bajo|medio|alto",
                "recomendacion": "resumen accionable sin agroquimicos sinteticos",
                "acciones": ["3 a 5 acciones concretas"],
                "confianza": "numero 0 a 100",
            },
        }
        try:
            result = await _responses_request(
                model=settings.openai_model_text,
                input_payload=json.dumps(user_prompt, ensure_ascii=False),
            )
            return DiagnosticoResult.model_validate(_extract_json(result)), settings.openai_model_text
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            logger.warning("Diagnostico guiado OpenAI fallo: %s", exc)

    # 3) Reglas locales (ultimo recurso, siempre responde).
    return _fallback_result(especie, sintomas, zona_afectada, tiempo_dias), "reglas-base (guiado)"


async def _diagnostico_guiado_ollama(
    *,
    especie: str,
    parte_planta: str | None,
    sintomas: list[str],
    zona_afectada: str | None,
    tiempo_dias: int | None,
    observaciones: str | None,
) -> DiagnosticoResult | None:
    """Genera el diagnostico con Ollama (llama3.2). Devuelve None si falla (para hacer fallback)."""
    settings = get_settings()
    prompt = (
        f"CULTIVO: {especie}\n"
        f"PARTE AFECTADA: {parte_planta or 'no especificada'}\n"
        f"SINTOMAS OBSERVADOS: {', '.join(sintomas) if sintomas else 'no especificados'}\n"
        f"ZONA / UBICACION DEL DANO: {zona_afectada or 'no especificada'}\n"
        f"TIEMPO DE EVOLUCION: {tiempo_dias if tiempo_dias is not None else 'desconocido'} dias\n"
        f"OBSERVACIONES ADICIONALES: {observaciones or 'ninguna'}\n\n"
        "Diagnostica el problema mas probable siguiendo las instrucciones del sistema."
    )

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": settings.ollama_llm_model,
                    "system": SYSTEM_PROMPT_GUIADO,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
                timeout=240,
            )
            response.raise_for_status()
            data = json.loads(response.json()["response"])
    except (httpx.HTTPError, KeyError, json.JSONDecodeError, ValueError) as exc:
        logger.warning(
            "Diagnostico guiado Ollama fallo tras %.1fs: %s", time.perf_counter() - started, exc
        )
        return None

    try:
        problema = str(data.get("problema") or "").strip()
        if not problema:
            return None
        nivel = str(data.get("nivel_riesgo") or "").strip().lower()
        if nivel not in {"bajo", "medio", "alto"}:
            nivel = None
        cientifico = data.get("nombre_cientifico")
        cientifico = str(cientifico).strip() if cientifico and str(cientifico).lower() != "null" else None
        confianza = int(float(data.get("confianza") or 60))
        confianza = max(0, min(100, confianza))
        acciones = [str(a).strip() for a in (data.get("acciones") or []) if str(a).strip()]
        alternativas = []
        for alt in data.get("alternativas") or []:
            nombre = str(alt.get("enfermedad") or "").strip()
            if not nombre:
                continue
            alt_conf = max(0.0, min(100.0, float(alt.get("confianza") or 0)))
            alternativas.append(DiagnosticoAlternativaResult(enfermedad=nombre, confianza=alt_conf))
    except (ValueError, TypeError, AttributeError) as exc:
        logger.warning("Diagnostico guiado Ollama: JSON con formato inesperado: %s", exc)
        return None

    logger.info(
        "Diagnostico guiado generado con %s en %.1fs (confianza %d%%)",
        settings.ollama_llm_model,
        time.perf_counter() - started,
        confianza,
    )
    return DiagnosticoResult(
        problema=problema,
        nivel_riesgo=nivel,
        recomendacion=str(data.get("recomendacion") or "").strip(),
        acciones=acciones,
        confianza=confianza,
        nombre_cientifico=cientifico,
        es_sano=False,
        alternativas=alternativas[:3],
    )


async def diagnostico_imagen(
    *,
    especie: str,
    image_base64: str,
    mime_type: str,
    sintomas: list[str],
    zona_afectada: str | None,
    tiempo_dias: int | None,
) -> tuple[DiagnosticoResult, str | None]:
    settings = get_settings()
    if not settings.openai_api_key or not settings.openai_model_vision:
        return _fallback_result(especie, sintomas or ["imagen sin analisis configurado"], zona_afectada, tiempo_dias), None

    data_url = f"data:{mime_type};base64,{image_base64}"
    prompt = json.dumps(
        {
            "modalidad": "diagnostico_por_imagen",
            "especie": especie,
            "sintomas_reportados": sintomas,
            "zona_afectada": zona_afectada,
            "tiempo_dias": tiempo_dias,
            "instruccion": "Analiza la imagen solo como apoyo inicial y responde JSON estricto.",
        },
        ensure_ascii=False,
    )
    result = await _responses_request(
        model=settings.openai_model_vision,
        input_payload=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": data_url, "detail": "auto"},
                ],
            }
        ],
    )
    return DiagnosticoResult.model_validate(_extract_json(result)), settings.openai_model_vision


async def _responses_request(*, model: str, input_payload: Any) -> str:
    settings = get_settings()
    payload = {
        "model": model,
        "instructions": SYSTEM_PROMPT_AGRO + "\nDevuelve solo JSON valido con problema, nivel_riesgo, recomendacion, acciones y confianza.",
        "input": input_payload,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
    if "output_text" in data and data["output_text"]:
        return data["output_text"]
    for item in data.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                return content["text"]
    raise ValueError("La respuesta de IA no contiene texto util.")

