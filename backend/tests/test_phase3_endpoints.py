from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from test_phase2_endpoints import FakeResult, FakeSession, client_with_overrides


NOW = datetime(2026, 5, 31, 12, 0, tzinfo=UTC)


def monitoreo_row(**overrides):
    row = {
        "id": UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"),
        "biohuerto_id": 1,
        "cultivo_id": None,
        "user_id": 2,
        "humedad_porcentaje": Decimal("62.50"),
        "temperatura_c": Decimal("24.30"),
        "luminosidad_lux": Decimal("18400.00"),
        "incidencia": None,
        "observacion": "Humedad adecuada",
        "registrado_en": NOW,
        "is_synced": True,
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def alerta_row(**overrides):
    row = {
        "id": 1,
        "biohuerto_id": 1,
        "cultivo_id": UUID("11111111-1111-4111-8111-111111111111"),
        "user_id": 2,
        "titulo": "Riego controlado",
        "descripcion": "Aplicar riego ligero",
        "tipo": "riego",
        "prioridad": 2,
        "estado": "pendiente",
        "fecha_programada": NOW,
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def practica_row(**overrides):
    row = {
        "id": 1,
        "biohuerto_id": 1,
        "cultivo_id": None,
        "user_id": 2,
        "tipo_practica": "compost",
        "descripcion": "Aplicacion de compost local",
        "insumo": "Compost local",
        "cantidad": Decimal("12.00"),
        "unidad": "kg",
        "fecha_aplicacion": date(2026, 5, 31),
        "es_sostenible": True,
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def costo_row(**overrides):
    row = {
        "id": 1,
        "biohuerto_id": 1,
        "cultivo_id": None,
        "user_id": 2,
        "categoria": "insumo",
        "descripcion": "Compost local",
        "monto": Decimal("18.00"),
        "moneda": "PEN",
        "fecha": date(2026, 5, 31),
        "created_at": NOW,
        "updated_at": NOW,
    }
    row.update(overrides)
    return row


def dashboard_results():
    return [
        FakeResult(rows=[{"user_id": 2}]),
        FakeResult(rows=[{"cultivos_activos": 3, "proximas_cosechas_7_dias": 1}]),
        FakeResult(rows=[{"etapa": "crecimiento", "total": 2}, {"etapa": "floracion", "total": 1}]),
        FakeResult(rows=[{"prioridad": 1, "total": 1}, {"prioridad": 2, "total": 2}]),
        FakeResult(rows=[{"categoria": "insumo", "total": Decimal("18.00")}, {"categoria": "agua", "total": Decimal("4.50")}]),
        FakeResult(rows=[{"total": 4, "sostenibles": 4}]),
        FakeResult(rows=[{"total": 2}]),
        FakeResult(rows=[{"total_kg_co2eq": Decimal("21.90")}]),
    ]


def test_create_monitoreo_for_owned_biohuerto():
    fake = FakeSession(
        [
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[monitoreo_row()]),
        ]
    )
    client = client_with_overrides(fake, role="productor")

    response = client.post(
        "/api/monitoreo",
        json={
            "biohuerto_id": 1,
            "humedad_porcentaje": "62.50",
            "temperatura_c": "24.30",
            "luminosidad_lux": "18400",
            "observacion": "Humedad adecuada",
        },
    )

    assert response.status_code == 201
    assert response.json()["humedad_porcentaje"] == "62.50"
    assert fake.committed is True


def test_list_alertas_orders_by_priority():
    fake = FakeSession([FakeResult(rows=[alerta_row(prioridad=1)])])
    client = client_with_overrides(fake, role="productor")

    response = client.get("/api/alertas?order_by=prioridad")

    assert response.status_code == 200
    assert response.json()[0]["prioridad"] == 1


def test_create_trazabilidad_practica_and_costo():
    fake_practica = FakeSession(
        [
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[practica_row()]),
        ]
    )
    client = client_with_overrides(fake_practica, role="productor")

    practica = client.post(
        "/api/trazabilidad/practicas",
        json={
            "biohuerto_id": 1,
            "tipo_practica": "compost",
            "descripcion": "Aplicacion de compost local",
            "insumo": "Compost local",
            "cantidad": "12.00",
            "unidad": "kg",
            "fecha_aplicacion": "2026-05-31",
            "es_sostenible": True,
        },
    )

    assert practica.status_code == 201
    assert practica.json()["es_sostenible"] is True

    fake_costo = FakeSession(
        [
            FakeResult(rows=[{"user_id": 2}]),
            FakeResult(rows=[costo_row()]),
        ]
    )
    client = client_with_overrides(fake_costo, role="productor")

    costo = client.post(
        "/api/trazabilidad/costos",
        json={
            "biohuerto_id": 1,
            "categoria": "insumo",
            "descripcion": "Compost local",
            "monto": "18.00",
            "moneda": "PEN",
            "fecha": "2026-05-31",
        },
    )

    assert costo.status_code == 201
    assert costo.json()["monto"] == "18.00"


def test_dashboard_indicadores_for_biohuerto():
    fake = FakeSession(dashboard_results())
    client = client_with_overrides(fake, role="productor")

    response = client.get("/api/dashboard/1")

    assert response.status_code == 200
    body = response.json()
    assert body["cultivos_activos"] == 3
    assert body["alertas_pendientes"]["alta"] == 1
    assert body["semaforo_ambiental"] == "verde"


def test_reporte_pdf_download():
    fake = FakeSession(
        [
            *dashboard_results(),
            FakeResult(rows=[{"id": 1, "user_id": 2, "nombre": "Biohuerto Demo", "codigo": "BH-DEMO", "area_m2": Decimal("42.50"), "descripcion": "Demo", "created_at": NOW, "updated_at": NOW}]),
            FakeResult(rows=[{"especie": "Lechuga", "etapa": "crecimiento", "fecha_siembra": date(2026, 5, 10), "fecha_estimada_cosecha": date(2026, 6, 25)}]),
            FakeResult(rows=[{"categoria": "insumo", "descripcion": "Compost local", "monto": Decimal("18.00"), "moneda": "PEN", "fecha": date(2026, 5, 31)}]),
        ]
    )
    client = client_with_overrides(fake, role="productor")

    response = client.get("/api/reportes/1/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")

