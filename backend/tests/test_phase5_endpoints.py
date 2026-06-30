import pytest
from pydantic import ValidationError

from app.schemas.diagnostico import DiagnosticoGuiadoCreate, DiagnosticoImagenCreate, DiagnosticoResult
from app.schemas.recomendaciones import RecomendacionCreate


def test_guided_diagnosis_sanitizes_symptoms():
    payload = DiagnosticoGuiadoCreate(
        especie="Tomate",
        sintomas=["  manchas amarillas ", "hojas bajas"],
        parte_planta="Hoja",
    )
    assert payload.sintomas == ["manchas amarillas", "hojas bajas"]


def test_image_diagnosis_validates_mime_and_minimum_body():
    with pytest.raises(ValidationError):
        DiagnosticoImagenCreate(image_base64="short", mime_type="application/pdf")


def test_diagnosis_result_and_recommendation_current_contract():
    result = DiagnosticoResult(problema="Posible hongo", nivel_riesgo="medio", confianza=78)
    recommendation = RecomendacionCreate(
        titulo="Retirar hojas afectadas",
        cuerpo="Retira las hojas y evita humedad nocturna.",
        categoria="agroecologica",
    )
    assert result.confianza == 78
    assert recommendation.tipo_manejo == "organico"


def test_diagnosis_rejects_empty_symptom_list():
    with pytest.raises(ValidationError):
        DiagnosticoGuiadoCreate(especie="Tomate", sintomas=[])
