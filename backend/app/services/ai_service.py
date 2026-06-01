import json
from typing import Any

import httpx

from app.config import get_settings
from app.schemas.diagnostico import DiagnosticoResult

SYSTEM_PROMPT_AGRO = """Eres un agronomo especialista en agricultura ecologica y biohuertos urbanos del departamento de Lambayeque, Peru.
Solo debes proporcionar recomendaciones de manejo sostenible usando metodos organicos, biologicos y tradicionales.
NUNCA recomiendes agroquimicos sinteticos. Basa tus respuestas en cultivos frecuentes de la region: aji, culantro, lechuga,
rabanito, tomate, zapallo, albahaca, cebolla china, espinaca y hierbas aromaticas locales. Responde en espanol peruano,
en un tono claro y accesible para pequenos productores comunitarios sin formacion tecnica formal."""


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
) -> tuple[DiagnosticoResult, str | None]:
    settings = get_settings()
    if not settings.openai_api_key or not settings.openai_model_text:
        return _fallback_result(especie, sintomas, zona_afectada, tiempo_dias), None

    user_prompt = {
        "modalidad": "diagnostico_guiado",
        "especie": especie,
        "sintomas": sintomas,
        "zona_afectada": zona_afectada,
        "tiempo_dias": tiempo_dias,
        "formato_salida": {
            "problema": "nombre breve del problema probable",
            "nivel_riesgo": "bajo|medio|alto",
            "recomendacion": "resumen accionable sin agroquimicos sinteticos",
            "acciones": ["3 a 5 acciones concretas"],
            "confianza": "numero 0 a 100",
        },
    }
    result = await _responses_request(
        model=settings.openai_model_text,
        input_payload=json.dumps(user_prompt, ensure_ascii=False),
    )
    return DiagnosticoResult.model_validate(_extract_json(result)), settings.openai_model_text


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

