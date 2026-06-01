import { AlertTriangle, CalendarDays, CloudSun, Coins, Leaf, Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import EmptyState from "../components/ui/EmptyState.jsx";
import MetricCard from "../components/ui/MetricCard.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import { useBiohuertos } from "../hooks/useBiohuertos.js";
import { api } from "../lib/api.js";
import { money, number, stageLabel } from "../lib/format.js";

export default function Dashboard() {
  const { selected, loading: loadingBiohuertos } = useBiohuertos();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError("");
    api
      .get(`/api/dashboard/${selected.id}`)
      .then(({ data }) => setDashboard(data))
      .catch((err) => setError(err.response?.data?.detail || "No se pudo cargar el dashboard."))
      .finally(() => setLoading(false));
  }, [selected]);

  if (!loadingBiohuertos && !selected) {
    return <EmptyState title="Crea un biohuerto para ver indicadores" detail="El dashboard se activara cuando exista una ficha de biohuerto." />;
  }

  return (
    <div>
      <PageHeader title="Dashboard" eyebrow={selected?.nombre || "Biohuerto"} />

      {(loading || loadingBiohuertos) && <Skeleton />}
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {dashboard && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Cultivos activos" value={dashboard.cultivos_activos} detail="Por campana vigente" icon={Sprout} />
            <MetricCard label="Proximas cosechas" value={dashboard.proximas_cosechas_7_dias} detail="Siguientes 7 dias" icon={CalendarDays} tone="amber" />
            <MetricCard label="Costos del mes" value={money(dashboard.costos_mes_total)} detail="Insumos, agua y mano de obra" icon={Coins} tone="slate" />
            <MetricCard label="CO2eq ahorrado" value={`${number(dashboard.co2eq_ahorrado_mes)} kg`} detail="Ultimo calculo registrado" icon={CloudSun} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="panel p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-950">Cultivos por etapa</h2>
                <StatusBadge tone={dashboard.semaforo_ambiental === "verde" ? "leaf" : dashboard.semaforo_ambiental === "amarillo" ? "amber" : "red"}>
                  {dashboard.sostenibilidad_porcentaje}% sostenible
                </StatusBadge>
              </div>
              <div className="mt-4 space-y-3">
                {Object.entries(dashboard.cultivos_por_etapa).map(([stage, total]) => (
                  <div key={stage}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{stageLabel(stage)}</span>
                      <span className="text-slate-500">{total}</span>
                    </div>
                    <div className="h-2 rounded bg-slate-100">
                      <div
                        className="h-2 rounded bg-leaf-700"
                        style={{ width: `${Math.max(8, (total / Math.max(1, dashboard.cultivos_activos)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-amber-600" size={20} />
                <h2 className="text-base font-bold text-slate-950">Alertas pendientes</h2>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <AlertCount label="Alta" value={dashboard.alertas_pendientes.alta} tone="red" />
                <AlertCount label="Media" value={dashboard.alertas_pendientes.media} tone="amber" />
                <AlertCount label="Baja" value={dashboard.alertas_pendientes.baja} tone="leaf" />
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <Leaf className="text-leaf-800" size={18} />
                  <p className="text-sm font-semibold text-slate-900">Semaforo ambiental</p>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Estado {dashboard.semaforo_ambiental} con {dashboard.sostenibilidad_porcentaje}% de practicas sostenibles.
                </p>
              </div>
            </section>
          </div>

          <section className="panel p-4">
            <h2 className="text-base font-bold text-slate-950">Costos por categoria</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {Object.entries(dashboard.costos_mes_por_categoria).map(([category, total]) => (
                <div key={category} className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{category}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{money(total)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function AlertCount({ label, value, tone }) {
  return (
    <div className="rounded-md border border-slate-200 p-3 text-center">
      <StatusBadge tone={tone}>{label}</StatusBadge>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="panel h-32 animate-pulse p-4">
          <div className="h-3 w-24 rounded bg-slate-200" />
          <div className="mt-5 h-8 w-28 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

