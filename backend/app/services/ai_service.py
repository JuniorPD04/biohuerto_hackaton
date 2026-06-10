import json

from app.config import get_settings
from app.schemas.diagnostico import DiagnosticoResult
from app.services.llm import openrouter_chat_json

SYSTEM_PROMPT_AGRO = """Eres un agronomo especialista en agricultura ecologica y biohuertos urbanos del departamento de Lambayeque, Peru.
Solo debes proporcionar recomendaciones de manejo sostenible usando metodos organicos, biologicos y tradicionales.
NUNCA recomiendes agroquimicos sinteticos. Basa tus respuestas en cultivos frecuentes de la region: aji, culantro, lechuga,
rabanito, tomate, zapallo, albahaca, cebolla china, espinaca y hierbas aromaticas locales. Responde en espanol peruano,
en un tono claro y accesible para pequenos productores comunitarios sin formacion tecnica formal.
Devuelve solo JSON valido con problema, nivel_riesgo, recomendacion, acciones y confianza."""


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


async def diagnostico_guiado(
    *,
    especie: str,
    sintomas: list[str],
    zona_afectada: str | None,
    tiempo_dias: int | None,
) -> tuple[DiagnosticoResult, str | None]:
    settings = get_settings()
    if not settings.openrouter_api_key:
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
    data = await openrouter_chat_json(
        model=settings.openrouter_model_text,
        system=SYSTEM_PROMPT_AGRO,
        user_content=json.dumps(user_prompt, ensure_ascii=False),
        timeout=60,
    )
    return DiagnosticoResult.model_validate(data), settings.openrouter_model_text
