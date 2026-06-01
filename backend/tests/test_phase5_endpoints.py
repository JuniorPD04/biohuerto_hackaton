from datetime import UTC, datetime
from uuid import UUID

from test_phase2_endpoints import FakeResult, FakeSession, client_with_overrides


NOW = datetime(2026, 5, 31, 12, 0, tzinfo=UTC)


def diagnostico_row(**overrides):
    row = {
        "id": UUID("cccccccc-cccc-4ccc-8ccc-ccccccccccc1"),
        "biohuerto_id": 1,
        "cultivo_id": None,
        "user_id": 2,
        "modalidad": "guiado",
        "especie": "Tomate",
        "sintomas": ["manchas amarillas", "hojas bajas afectadas"],
        "zona_afectada": "hojas",
        "tiempo_dias": 3,
        "resultado_nombre": "Posible problema fungico foliar inicial en hojas",
        "nivel_riesgo": "medio",
        "recomendacion_resumen": "Retirar hojas afectadas y evitar humedad nocturna.",
        "modelo_usado": None,
        "is_synced": True,
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def recomendacion_row(**overrides):
    row = {
        "id": 1,
        "diagnostico_id": UUID("cccccccc-cccc-4ccc-8ccc-ccccccccccc1"),
        "cultivo_id": None,
        "titulo": "Posible problema fungico foliar inicial",
        "cuerpo": "Retirar hojas afectadas y aplicar cola de caballo.",
        "categoria": "agroecologica",
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def test_create_guided_diagnostico_uses_fallback_and_saves_recommendation():
    fake = FakeSession(
        [
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[diagnostico_row()]),
            FakeResult(rows=[]),
        ]
    )
    client = client_with_overrides(fake, role="productor")

    response = client.post(
        "/api/diagnostico/guiado",
        json={
            "biohuerto_id": 1,
            "especie": "Tomate",
            "sintomas": ["manchas amarillas", "hojas bajas afectadas"],
            "zona_afectada": "hojas",
            "tiempo_dias": 3,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["modalidad"] == "guiado"
    assert body["nivel_riesgo"] == "medio"
    assert fake.committed is True


def test_image_diagnostico_rejects_large_image_before_database_work():
    fake = FakeSession([])
    client = client_with_overrides(fake, role="productor")

    response = client.post(
        "/api/diagnostico/imagen",
        json={
            "biohuerto_id": 1,
            "especie": "Lechuga",
            "image_base64": "a" * (7 * 1024 * 1024),
            "mime_type": "image/jpeg",
        },
    )

    assert response.status_code == 413


def test_list_diagnosticos_for_productor():
    fake = FakeSession(
        [
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[diagnostico_row()]),
        ]
    )
    client = client_with_overrides(fake, role="productor")

    response = client.get("/api/diagnostico?biohuerto_id=1")

    assert response.status_code == 200
    assert response.json()[0]["resultado_nombre"].startswith("Posible")


def test_list_recomendaciones_for_productor():
    fake = FakeSession([FakeResult(rows=[recomendacion_row()])])
    client = client_with_overrides(fake, role="productor")

    response = client.get("/api/recomendaciones")

    assert response.status_code == 200
    assert response.json()[0]["categoria"] == "agroecologica"

