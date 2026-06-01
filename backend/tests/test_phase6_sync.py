from datetime import UTC, datetime, timedelta
from uuid import UUID

from test_phase2_endpoints import FakeResult, FakeSession, client_with_overrides


NOW = datetime(2026, 5, 31, 12, 0, tzinfo=UTC)


def incidencia_row(**overrides):
    row = {
        "id": UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"),
        "biohuerto_id": 1,
        "cultivo_id": None,
        "user_id": 2,
        "tipo": "fitosanitaria",
        "descripcion": "Hojas con manchas",
        "severidad": "media",
        "estado": "abierta",
        "reportado_en": NOW,
        "is_synced": True,
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def test_create_incidencia_endpoint():
    fake = FakeSession(
        [
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[incidencia_row()]),
        ]
    )
    client = client_with_overrides(fake, role="productor")

    response = client.post(
        "/api/incidencias",
        json={
            "biohuerto_id": 1,
            "tipo": "fitosanitaria",
            "descripcion": "Hojas con manchas",
            "severidad": "media",
        },
    )

    assert response.status_code == 201
    assert response.json()["tipo"] == "fitosanitaria"
    assert fake.committed is True


def test_sync_monitoreo_and_incidencia_success():
    fake = FakeSession(
        [
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
            FakeResult(rows=[]),
        ]
    )
    client = client_with_overrides(fake, role="productor")

    response = client.post(
        "/api/sync",
        json={
            "registros": [
                {
                    "tabla": "monitoreo_registros",
                    "uuid": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
                    "created_at_local": NOW.isoformat(),
                    "payload": {
                        "biohuerto_id": 1,
                        "humedad_porcentaje": "58.20",
                        "temperatura_c": "24.10",
                        "observacion": "Offline",
                    },
                },
                {
                    "tabla": "incidencias",
                    "uuid": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9",
                    "created_at_local": NOW.isoformat(),
                    "payload": {
                        "biohuerto_id": 1,
                        "tipo": "fitosanitaria",
                        "descripcion": "Reporte offline",
                        "severidad": "media",
                    },
                },
            ]
        },
    )

    assert response.status_code == 200
    assert response.json() == {"sincronizados": 2, "conflictos": []}
    assert fake.committed is True


def test_sync_server_wins_conflict():
    fake = FakeSession(
        [
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[{"updated_at": NOW + timedelta(minutes=5)}]),
            FakeResult(rows=[]),
        ]
    )
    client = client_with_overrides(fake, role="productor")

    response = client.post(
        "/api/sync",
        json={
            "registros": [
                {
                    "tabla": "monitoreo_registros",
                    "uuid": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
                    "created_at_local": NOW.isoformat(),
                    "payload": {"biohuerto_id": 1, "observacion": "Version local antigua"},
                }
            ]
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["sincronizados"] == 0
    assert body["conflictos"][0]["reason"] == "server-wins"

