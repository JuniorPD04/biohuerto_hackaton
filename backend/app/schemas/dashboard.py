from decimal import Decimal

from pydantic import BaseModel


class DashboardOut(BaseModel):
    biohuerto_id: int
    total_cultivos: int
    cultivos_por_etapa: list[dict]
    alertas_pendientes: int
    ultimas_lecturas: list[dict]
    promedio_humedad: Decimal | None
    promedio_temperatura: Decimal | None


class PanelOut(BaseModel):
    horizonte_dias: int
    proximas_cosechas: list[dict]
    total_proximas: int
    alertas_pendientes: dict
    cultivos_por_etapa: list[dict]
    total_cultivos_activos: int
    costos: list[dict]
    costo_total: float
    costo_agua: float
    sostenibilidad: dict
    huella_total_kg_co2: float
    compost_kg: float
    semaforo_ambiental: list[dict]
