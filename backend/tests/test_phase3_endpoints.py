from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas.cuidados import CuidadoCreate
from app.schemas.incidencias import IncidenciaCreate
from app.schemas.monitoreo import MonitoreoCreate
from app.schemas.trazabilidad import CostoCreate, PracticaCreate
from test_phase2_endpoints import FakeSession, client_with_overrides

CULTIVO_ID = UUID("11111111-1111-4111-8111-111111111111")


def test_field_schemas_use_uuid_and_sanitize_text():
    monitoreo = MonitoreoCreate(cultivo_id=CULTIVO_ID, humedad_pct="62.50", observacion="  Humedad adecuada  ")
    incidencia = IncidenciaCreate(cultivo_id=CULTIVO_ID, tipo="Fitosanitaria", descripcion="  Hojas con manchas ")
    cuidado = CuidadoCreate(cultivo_id=CULTIVO_ID, tipo="Riego", frecuencia_dias=3)
    assert monitoreo.observacion == "Humedad adecuada"
    assert incidencia.descripcion == "Hojas con manchas"
    assert cuidado.frecuencia_dias == 3


def test_traceability_schemas_preserve_current_contract():
    practica = PracticaCreate(
        cultivo_id=CULTIVO_ID, tipo="Compost", descripcion="Aplicacion local",
        fecha="2026-06-28", cantidad="12.00",
    )
    costo = CostoCreate(
        cultivo_id=CULTIVO_ID, categoria="Insumo", descripcion="Compost",
        monto="18.00", moneda="pen", fecha="2026-06-28",
    )
    assert practica.fecha.isoformat() == "2026-06-28"
    assert costo.moneda == "PEN"


def test_monitoreo_rejects_out_of_range_values():
    with pytest.raises(ValidationError):
        MonitoreoCreate(cultivo_id=CULTIVO_ID, humedad_pct=120)


def test_field_endpoint_rejects_legacy_payload_without_cultivo():
    client = client_with_overrides(FakeSession([]), role="productor")
    response = client.post("/api/monitoreo", json={"biohuerto_id": 1, "humedad_porcentaje": "60"})
    assert response.status_code == 422
