import { Download, FileText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import MetricCard from "../components/ui/MetricCard.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import { useBiohuertos } from "../hooks/useBiohuertos.js";
import { api, downloadPdf } from "../lib/api.js";
import { money, number } from "../lib/format.js";

export default function Reporte() {
  const { selected } = useBiohuertos();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get(`/api/dashboard/${selected.id}`);
      setDashboard(data);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo cargar el reporte.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [selected]);

  async function handleDownload() {
    if (!selected) return;
    await downloadPdf(`/api/reportes/${selected.id}/pdf`, `reporte_biohuerto_${selected.id}.pdf`);
  }

  return (
    <div>
      <PageHeader
        title="Reporte"
        eyebrow={selected?.nombre || "Resumen descargable"}
        actions={
          <>
            <button className="icon-button" onClick={load} title="Actualizar" type="button">
              <RefreshCw size={18} />
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-leaf-800 px-4 text-sm font-bold text-white hover:bg-leaf-900 disabled:opacity-60"
              disabled={!selected}
              onClick={handleDownload}
              type="button"
            >
              <Download size={18} />
              PDF
            </button>
          </>
        }
      />
      {loading && <p className="text-sm text-slate-500">Cargando reporte...</p>}
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {dashboard && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Cultivos activos" value={dashboard.cultivos_activos} icon={FileText} />
            <MetricCard label="Costos del mes" value={money(dashboard.costos_mes_total)} tone="slate" />
            <MetricCard label="CO2eq ahorrado" value={`${number(dashboard.co2eq_ahorrado_mes)} kg`} tone="amber" />
          </div>
          <section className="panel p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Vista previa</h2>
                <p className="text-sm text-slate-500">Biohuerto #{dashboard.biohuerto_id}</p>
              </div>
              <StatusBadge tone={dashboard.semaforo_ambiental === "verde" ? "leaf" : "amber"}>
                {dashboard.semaforo_ambiental}
              </StatusBadge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <PreviewLine label="Cosechas publicadas" value={dashboard.cosechas_publicadas} />
              <PreviewLine label="Proximas cosechas" value={dashboard.proximas_cosechas_7_dias} />
              <PreviewLine label="Sostenibilidad" value={`${dashboard.sostenibilidad_porcentaje}%`} />
              <PreviewLine
                label="Alertas pendientes"
                value={`${dashboard.alertas_pendientes.alta} alta, ${dashboard.alertas_pendientes.media} media, ${dashboard.alertas_pendientes.baja} baja`}
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PreviewLine({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-950">{value}</p>
    </div>
  );
}

