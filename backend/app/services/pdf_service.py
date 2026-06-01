from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.schemas.dashboard import DashboardOut


def build_biohuerto_report_pdf(
    *,
    biohuerto: dict[str, Any],
    dashboard: DashboardOut,
    cultivos: list[dict[str, Any]],
    costos: list[dict[str, Any]],
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title="Reporte Biohuerto")
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Reporte resumido del biohuerto", styles["Title"]),
        Paragraph(str(biohuerto.get("nombre", "Biohuerto")), styles["Heading2"]),
        Paragraph(f"Codigo: {biohuerto.get('codigo', '-')}", styles["Normal"]),
        Paragraph(f"Area: {biohuerto.get('area_m2', 0)} m2", styles["Normal"]),
        Spacer(1, 12),
        Paragraph("Indicadores clave", styles["Heading2"]),
    ]

    indicadores = [
        ["Indicador", "Valor"],
        ["Cultivos activos", dashboard.cultivos_activos],
        ["Proximas cosechas 7 dias", dashboard.proximas_cosechas_7_dias],
        ["Alertas alta/media/baja", f"{dashboard.alertas_pendientes['alta']} / {dashboard.alertas_pendientes['media']} / {dashboard.alertas_pendientes['baja']}"],
        ["Costos del mes", f"S/ {dashboard.costos_mes_total}"],
        ["Semaforo ambiental", dashboard.semaforo_ambiental],
        ["Sostenibilidad", f"{dashboard.sostenibilidad_porcentaje}%"],
        ["CO2eq ahorrado", f"{dashboard.co2eq_ahorrado_mes} kg"],
    ]
    story.append(_table(indicadores))
    story.extend([Spacer(1, 12), Paragraph("Cultivos", styles["Heading2"])])
    cultivos_rows = [["Especie", "Etapa", "Siembra", "Cosecha estimada"]]
    cultivos_rows.extend(
        [
            [
                cultivo.get("especie", "-"),
                cultivo.get("etapa", "-"),
                str(cultivo.get("fecha_siembra", "-")),
                str(cultivo.get("fecha_estimada_cosecha", "-")),
            ]
            for cultivo in cultivos[:8]
        ]
    )
    story.append(_table(cultivos_rows))

    story.extend([Spacer(1, 12), Paragraph("Costos recientes", styles["Heading2"])])
    costos_rows = [["Categoria", "Descripcion", "Monto", "Fecha"]]
    costos_rows.extend(
        [
            [
                costo.get("categoria", "-"),
                costo.get("descripcion", "-")[:45],
                f"{costo.get('moneda', 'PEN')} {costo.get('monto', 0)}",
                str(costo.get("fecha", "-")),
            ]
            for costo in costos[:8]
        ]
    )
    story.append(_table(costos_rows))

    doc.build(story)
    return buffer.getvalue()


def _table(rows: list[list[Any]]) -> Table:
    table = Table(rows, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#166534")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f4f6")]),
            ]
        )
    )
    return table

