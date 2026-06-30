from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID

from app.schemas.sync import SyncChange, SyncResult
from app.routers.notifications import _decode_image
from test_phase2_endpoints import FakeResult, FakeSession, client_with_overrides

NOW = datetime(2026, 6, 28, 12, 0, tzinfo=UTC)
OP_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1")
RECORD_ID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1")
DEVICE_ID = UUID("cccccccc-cccc-4ccc-8ccc-ccccccccccc1")


def operation_payload():
    return {
        "device_id": str(DEVICE_ID),
        "cursor": 4,
        "operations": [{
            "operation_id": str(OP_ID), "device_id": str(DEVICE_ID),
            "entity": "monitoreo_registros", "action": "create",
            "record_id": str(RECORD_ID), "base_version": None,
            "client_updated_at": NOW.isoformat(),
            "payload": {"cultivo_id": "11111111-1111-4111-8111-111111111111", "humedad_pct": "58.20"},
        }],
    }


def test_sync_v2_contract_applies_and_pulls(monkeypatch):
    async def fake_apply(session, user, operation):
        return SyncResult(
            operation_id=operation.operation_id, entity=operation.entity,
            record_id=operation.record_id, status="applied", server_version=8,
            record={"id": str(operation.record_id), "humedad_pct": 58.2},
        )

    async def fake_pull(session, user, cursor):
        return ([SyncChange(entity="monitoreo_registros", record_id=RECORD_ID,
                            server_version=8, record={"id": str(RECORD_ID)})], 9, False)

    monkeypatch.setattr("app.routers.sync.apply_operation", fake_apply)
    monkeypatch.setattr("app.routers.sync.pull_changes", fake_pull)
    fake = FakeSession([])
    client = client_with_overrides(fake, role="productor")
    response = client.post("/api/sync", json=operation_payload())
    assert response.status_code == 200
    assert response.json()["results"][0]["status"] == "applied"
    assert response.json()["next_cursor"] == 9


def test_sync_rejects_more_than_fifty_operations():
    payload = operation_payload()
    payload["operations"] = payload["operations"] * 51
    client = client_with_overrides(FakeSession([]), role="productor")
    response = client.post("/api/sync", json=payload)
    assert response.status_code == 422


def test_notification_preferences_have_safe_defaults():
    fake = FakeSession([FakeResult(rows=[])])
    client = client_with_overrides(fake, role="productor")
    response = client.get("/api/notifications/preferences")
    assert response.status_code == 200
    assert response.json() == {
        "alertas_altas": True, "cuidados": True,
        "conflictos": True, "sincronizacion": False,
    }


def test_only_admin_can_open_notification_recipient_directory():
    client = client_with_overrides(FakeSession([]), role="productor")
    response = client.get("/api/notifications/admin/recipients")
    assert response.status_code == 403


def test_admin_can_queue_campaign_for_specific_user(monkeypatch):
    monkeypatch.setattr(
        "app.routers.notifications.get_settings",
        lambda: SimpleNamespace(vapid_private_key="test-key", pgcrypto_key="test"),
    )
    fake = FakeSession([
        FakeResult(rows=[(7,)]),
        FakeResult(),
        FakeResult(),
        FakeResult(),
        FakeResult(scalar=1),
    ])
    client = client_with_overrides(fake, role="admin")
    response = client.post(
        "/api/notifications/admin/campaigns",
        json={
            "title": "Taller de compostaje",
            "body": "Te esperamos este sabado a las 9:00 a. m.",
            "audience_type": "specific",
            "recipient_ids": [7],
            "target_url": "/",
        },
    )
    assert response.status_code == 201
    assert response.json()["recipient_count"] == 1
    assert response.json()["subscribed_recipient_count"] == 1
    assert fake.committed is True


def test_campaign_image_accepts_supported_data_url():
    image, mime = _decode_image("data:image/png;base64,aW1hZ2U=")
    assert image == b"image"
    assert mime == "image/png"


def test_campaign_history_does_not_depend_on_delivery_table():
    campaign_id = UUID("dddddddd-dddd-4ddd-8ddd-dddddddddddd")
    fake = FakeSession([FakeResult(rows=[{
        "id": campaign_id,
        "audience_type": "specific",
        "title": "Aviso de prueba",
        "body": "Mensaje de prueba",
        "target_url": "/",
        "created_at": NOW,
        "has_image": False,
        "created_by_name": "Administrador",
        "recipient_count": 1,
        "subscribed_recipient_count": 1,
        "sent_recipient_count": 0,
        "failed_delivery_count": 0,
        "recipient_ids": [7],
    }])])
    client = client_with_overrides(fake, role="admin")
    response = client.get("/api/notifications/admin/campaigns")
    assert response.status_code == 200
    assert response.json()[0]["status"] == "queued"
    assert "notification_deliveries" not in fake.calls[0][0]
