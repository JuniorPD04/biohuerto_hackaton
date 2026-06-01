from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


SemaforoAmbiental = Literal["verde", "amarillo", "rojo"]


class DashboardOut(BaseModel):
    biohuerto_id: int
    cultivos_activos: int
    cultivos_por_etapa: dict[str, int]
    proximas_cosechas_7_dias: int
    alertas_pendientes: dict[str, int]
    cosechas_publicadas: int
    costos_mes_total: Decimal
    costos_mes_por_categoria: dict[str, Decimal]
    sostenibilidad_porcentaje: Decimal
    semaforo_ambiental: SemaforoAmbiental
    co2eq_ahorrado_mes: Decimal

