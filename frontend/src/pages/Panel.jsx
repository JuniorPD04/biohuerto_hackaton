import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import Icon from "../components/ui/Icon.jsx";
import { Button, Card, EmptyState, Modal, PageHeader, Select } from "../components/ui/primitives.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import { dashboardApi } from "../lib/resources.js";
import { ETAPAS, fmtFecha, fmtMoneda, tintFor, tintGradient } from "../lib/theme.js";

const PRIORIDADES = {
  alta: { lab: "Alta", bg: "#fbe1de", fg: "#b23a2e", dot: "#d6584a" },
  media: { lab: "Media", bg: "#fbf0c9", fg: "#8a6b16", dot: "#e2b53a" },
  baja: { lab: "Baja", bg: "#dcefd7", fg: "#2f6b34", dot: "#5aa860" },
};

const COSTO_COLORES = {
  Insumos: "#5aa860",
  "Mano de obra": "#e0863f",
  Agua: "#3f86bf",
  Herramientas: "#8a6b16",
  Otros: "#9aa39a",
};

function fmtHorizonte(d) {
  if (d < 30) return `${d} días`;
  if (d === 30) return "30 días";
  return `${Math.round(d / 30)} meses`;
}

export default function Panel() {
  const toast = useToast();
  const [horizonte, setHorizonte] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    dashboardApi
      .overview(horizonte)
      .then((d) => alive && setData(d))
      .catch(() => alive && toast("No se pudo cargar el panel", "danger"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [horizonte, toast]);

  if (loading && !data) {
    return (
      <div className="animate-fade">
        <PageHeader title="Panel" subtitle="Resumen del estado productivo, alertas y sostenibilidad del biohuerto." />
        <div className="grid place-items-center py-20 text-muted-2">Cargando panel…</div>
      </div>
    );
  }
  if (!data) return null;

  const porEtapa = (data.cultivos_por_etapa || []).map((e) => ({ etapa: e.etapa, n: e.total }));
  const totalCultivos = data.total_cultivos_activos || 0;
  const costBars = (data.costos || [])
    .filter((c) => c.monto > 0)
    .map((c) => ({ label: c.categoria, color: COSTO_COLORES[c.categoria] || "#9aa39a", value: c.monto }));

  const reporte = { data, costBars, porEtapa, totalCultivos, horizonte };

  return (
    <div className="animate-fade">
      <PageHeader title="Panel" subtitle="Resumen del estado productivo, alertas y sostenibilidad del biohuerto." />

      {/* Reporte resumido (acción principal, arriba del panel) */}
      <Card pad="p-6" className="mb-6 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-[14px]">
          <span className="grid h-[46px] w-[46px] place-items-center rounded-xl bg-accent-50 text-primary">
            <Icon name="chart" size={24} />
          </span>
          <div>
            <h3 className="m-0 text-[17px] font-extrabold text-text">Reporte resumido del biohuerto</h3>
            <p className="mt-[3px] text-[13.5px] text-muted-2">Incluye cultivos, cosechas, costos e indicadores de sostenibilidad.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon="eye" onClick={() => setPreview(true)}>
            Vista previa
          </Button>
          <Button icon="download" onClick={() => descargarReporte(reporte, toast)}>
            Descargar PDF
          </Button>
        </div>
      </Card>

      {/* Fila 1: próximas cosechas | alertas + etapas */}
      <div className="mb-6 grid items-stretch gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Próximas cosechas */}
        <Card pad="p-[26px]" className="flex flex-col">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="m-0 text-[19px] font-extrabold text-text">Top 5 próximas cosechas</h3>
              <p className="mt-1 text-[13.5px] text-muted-2">Ordenadas por fecha de corte más cercana</p>
            </div>
            <div className="flex items-center gap-[9px]">
              <span className="whitespace-nowrap text-[13px] font-bold text-muted-2">A futuro</span>
              <Select value={horizonte} onChange={(e) => setHorizonte(+e.target.value)} className="!w-[140px]">
                <option value={7}>1 semana</option>
                <option value={15}>15 días</option>
                <option value={30}>30 días</option>
                <option value={60}>2 meses</option>
                <option value={90}>3 meses</option>
              </Select>
            </div>
          </div>

          <div className="grid flex-1 content-start gap-[10px]">
            {data.proximas_cosechas.length === 0 ? (
              <EmptyState icon="basket" title="Sin cosechas en la ventana" desc="Amplía el filtro de días para ver próximas cosechas." />
            ) : (
              data.proximas_cosechas.map((c, i) => (
                <div
                  key={c.cultivo_id}
                  className="flex items-center gap-[14px] rounded-[13px] border border-line bg-chip-2 px-[14px] py-3"
                >
                  <span
                    className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] text-[15px] font-extrabold text-white"
                    style={{ background: tintGradient(tintFor(c.especie)) }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-extrabold text-text">{c.especie}</div>
                    <div className="flex items-center gap-[5px] text-[12.5px] font-semibold text-muted-2">
                      <Icon name="pin" size={13} />
                      {c.biohuerto}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="font-mono text-[13.5px] font-extrabold text-primary">{fmtFecha(c.fecha_estimada_cosecha)}</div>
                    <div className="text-xs font-semibold text-muted-2">
                      en {c.dias} {c.dias === 1 ? "día" : "días"}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-[18px] flex items-center justify-between border-t border-line pt-4">
            <span className="text-sm font-bold text-muted-1">Total próximas cosechas en {fmtHorizonte(horizonte)}</span>
            <span className="text-[28px] font-extrabold leading-none text-primary">{data.total_proximas}</span>
          </div>
        </Card>

        {/* Columna derecha */}
        <div className="grid gap-6">
          {/* Alertas pendientes */}
          <Card pad="p-6">
            <div className="mb-[18px] flex items-center gap-[10px]">
              <Icon name="bell" size={20} stroke={2} />
              <h3 className="m-0 text-lg font-extrabold text-text">Alertas pendientes</h3>
              <span className="ml-auto text-[13px] font-bold text-muted-2">{data.alertas_pendientes.total} en total</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["alta", "media", "baja"].map((k) => {
                const p = PRIORIDADES[k];
                return (
                  <div
                    key={k}
                    className="rounded-[14px] px-3 py-[14px] text-center"
                    style={{ background: p.bg, border: `1px solid ${p.dot}33` }}
                  >
                    <div className="mb-2 inline-flex items-center gap-[6px] text-[12.5px] font-extrabold" style={{ color: p.fg }}>
                      <span className="h-[7px] w-[7px] rounded-full" style={{ background: p.dot }} />
                      {p.lab}
                    </div>
                    <div className="text-[34px] font-extrabold leading-none" style={{ color: p.fg }}>
                      {data.alertas_pendientes[k]}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Cultivos por etapa */}
          <Card pad="p-6">
            <div className="mb-[18px] flex items-center gap-[10px]">
              <Icon name="chart" size={20} stroke={2} />
              <h3 className="m-0 whitespace-nowrap text-lg font-extrabold text-text">Cultivos por etapa</h3>
            </div>
            <EtapaBars data={porEtapa} />
            <div className="mt-[18px] flex items-center justify-between border-t border-line pt-[14px]">
              <span className="text-sm font-bold text-muted-1">Total cultivos activos</span>
              <span className="text-2xl font-extrabold leading-none text-primary">{totalCultivos}</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Fila 2: (costos + eco cards) | semáforo ambiental */}
      <div className="mb-6 grid items-stretch gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card pad="p-[26px]">
            <div className="mb-[22px] flex items-start justify-between">
              <div>
                <h3 className="m-0 text-[19px] font-extrabold text-text">Costos acumulados</h3>
                <p className="mt-1 text-[13.5px] text-muted-2">Distribución por categoría · Campaña actual</p>
              </div>
              <div className="text-right">
                <div className="text-[28px] font-extrabold text-terracotta">{fmtMoneda(data.costo_total)}</div>
                <div className="text-[12.5px] font-semibold text-muted-2">total invertido</div>
              </div>
            </div>
            <CostBars data={costBars} />
          </Card>

          <div className="grid flex-1 grid-rows-2 gap-6">
            <EcoCard icon="seedling" tint="zanahoria" titulo="Compost aplicado" valor={`${data.compost_kg.toFixed(0)} kg`} sub="compost registrado en el periodo" />
            <EcoCard icon="drop" tint="espinaca" titulo="Costo de agua acumulado" valor={fmtMoneda(data.costo_agua)} sub="categoría Agua en costeo de cultivos" />
          </div>
        </div>

        <SemaforoAmbiental cultivos={data.semaforo_ambiental} />
      </div>

      <Modal
        open={preview}
        onClose={() => setPreview(false)}
        title="Reporte resumido del biohuerto"
        subtitle="Vista previa · Campaña actual"
        width={680}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPreview(false)}>
              Cerrar
            </Button>
            <Button icon="download" onClick={() => descargarReporte(reporte, toast)}>
              Descargar PDF
            </Button>
          </>
        }
      >
        <ReporteContenido r={reporte} />
      </Modal>
    </div>
  );
}

/* ---- Barras de cultivos por etapa ---- */
function EtapaBars({ data }) {
  const maxVal = Math.max(1, ...data.map((d) => d.n));
  const ticks = Array.from({ length: maxVal + 1 }, (_, i) => i);
  const yW = 112;
  return (
    <div>
      <div className="grid gap-[11px]">
        {data.map((d) => {
          const e = ETAPAS[d.etapa] || ETAPAS.semillero;
          return (
            <div key={d.etapa} className="grid items-center gap-3" style={{ gridTemplateColumns: `${yW}px 1fr` }}>
              <span className="truncate text-right text-[13px] font-bold text-muted-1">{e.label}</span>
              <div className="relative h-[18px]">
                {ticks.map((t) => (
                  <span
                    key={t}
                    className="absolute bottom-0 top-0 w-px"
                    style={{ left: `${(t / maxVal) * 100}%`, background: t === 0 ? "var(--line-2)" : "var(--line)", transform: t === maxVal ? "translateX(-1px)" : "none" }}
                  />
                ))}
                <div
                  className="absolute left-0 top-1/2 h-[14px] -translate-y-1/2 rounded-r transition-[width] duration-700"
                  style={{ width: `${(d.n / maxVal) * 100}%`, minWidth: d.n ? 6 : 0, background: e.dot }}
                />
                <span
                  className="absolute top-1/2 -translate-y-1/2 text-[12.5px] font-extrabold text-text"
                  style={{ left: `calc(${(d.n / maxVal) * 100}% + 8px)` }}
                >
                  {d.n}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: `${yW}px 1fr` }}>
        <span />
        <div className="relative h-4 border-t border-line-2">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-[3px] -translate-x-1/2 text-[11.5px] font-bold text-muted-2"
              style={{ left: `${(t / maxVal) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---- Barras de costos ---- */
function CostBars({ data }) {
  const max = Math.max(1, ...data.map((c) => c.value));
  return (
    <div className="grid gap-4">
      {data.map((c) => (
        <div key={c.label}>
          <div className="mb-[7px] flex justify-between">
            <span className="text-sm font-bold text-text">{c.label}</span>
            <span className="text-sm font-extrabold text-terracotta">{fmtMoneda(c.value)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-chip">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(c.value / max) * 100}%`, background: c.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Semáforo ambiental por práctica ---- */
const SEMAFORO_COLORS = {
  verde: "#3f9a48",
  amarillo: "#e2b53a",
  rojo: "#d6584a",
};

/* Mini semáforo vertical de 3 luces (la activa enciende, las demás atenuadas) */
function MiniSemaforo({ estado }) {
  const luces = ["rojo", "amarillo", "verde"];
  return (
    <div
      className="flex flex-shrink-0 flex-col items-center gap-[6px] rounded-full border-2 bg-white px-[7px] py-[9px]"
      style={{ borderColor: "#9aa79a", boxShadow: "inset 0 0 0 1px #ffffff, 0 1px 2px rgba(28,42,32,.12)" }}
    >
      {luces.map((l) => {
        const on = l === estado;
        const c = SEMAFORO_COLORS[l];
        return (
          <span
            key={l}
            className="h-[13px] w-[13px] rounded-full border transition-all"
            style={{
              background: on ? c : "#e3e8e0",
              borderColor: on ? c : "#9aa79a",
              boxShadow: on ? `0 0 0 3px ${c}33` : "inset 0 1px 1px rgba(28,42,32,.12)",
            }}
          />
        );
      })}
    </div>
  );
}

/* Una fila = una práctica evaluada */
function PracticaRow({ icon, titulo, valor, criterio, estado }) {
  const ok = estado === "verde";
  const cColor = SEMAFORO_COLORS[estado];
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line py-[14px] first:border-t-0">
      <div className="min-w-0">
        <div className="flex items-center gap-[9px]">
          <Icon name={icon} size={17} stroke={2} className="flex-shrink-0 text-muted-1" />
          <span className="text-[14.5px] font-extrabold text-text">{titulo}</span>
        </div>
        <div className="mt-[5px] text-[12.5px] font-semibold text-muted-1">{valor}</div>
        <div className="mt-[3px] flex items-center gap-[5px] text-[12px] font-bold" style={{ color: cColor }}>
          <Icon name={ok ? "check" : "alertTri"} size={13} stroke={2.4} />
          {criterio}
        </div>
      </div>
      <MiniSemaforo estado={estado} />
    </div>
  );
}

/* Construye las 4 prácticas evaluadas (con su semáforo) para un cultivo */
function buildSemaforoRows(c) {
  const compostKg = c.compost_kg || 0;
  const nCompost = c.n_compost || 0;
  const aguaM3 = c.agua_m3 || 0;
  const areaM2 = c.area_m2 || 0;
  const ctrlBio = c.aplicaciones_control_bio || 0;

  // Umbral de agua: óptimo ≈ 0.4 m³/m² · alto hasta 0.7 m³/m²
  const umbralOptimo = Math.round(areaM2 * 0.4);
  const ratioAgua = areaM2 > 0 ? aguaM3 / areaM2 : 0;
  const estadoAgua = ratioAgua <= 0.42 ? "verde" : ratioAgua <= 0.7 ? "amarillo" : "rojo";

  return [
    {
      icon: "recycle",
      titulo: "Compost / Abono orgánico",
      valor:
        compostKg > 0
          ? `${compostKg.toFixed(0)} kg aplicados${nCompost ? ` · ${nCompost} ${nCompost === 1 ? "aplicación" : "aplicaciones"} esta campaña` : ""}`
          : "Sin abono orgánico registrado",
      criterio: compostKg > 0 ? "Óptimo: al menos 1 aplicación por campaña" : "Pendiente: aplicar abono orgánico",
      estado: compostKg > 0 ? "verde" : "rojo",
    },
    {
      icon: "drop",
      titulo: "Consumo de agua",
      valor: `${aguaM3.toFixed(1)} m³ consumidos · ${areaM2.toFixed(0)} m² de cultivo`,
      criterio:
        estadoAgua === "verde"
          ? `Óptimo: ≤ ${umbralOptimo} m³ para ${areaM2.toFixed(0)} m²`
          : estadoAgua === "amarillo"
            ? `Alto: óptimo ≤ ${umbralOptimo} m³ para ${areaM2.toFixed(0)} m²`
            : `Excesivo: óptimo ≤ ${umbralOptimo} m³ para ${areaM2.toFixed(0)} m²`,
      estado: estadoAgua,
    },
    {
      icon: "ban",
      titulo: "Sin agroquímicos",
      valor: "Ningún agroquímico aplicado en toda la campaña",
      criterio: "Óptimo: 0 agroquímicos",
      estado: "verde",
    },
    {
      icon: "leaf",
      titulo: "Control biológico",
      valor:
        ctrlBio >= 1
          ? `${ctrlBio} ${ctrlBio === 1 ? "aplicación" : "aplicaciones"} · manejo preventivo de plagas`
          : "Sin control biológico registrado",
      criterio: ctrlBio >= 1 ? "Óptimo: al menos 1 acción preventiva" : "Pendiente: incorporar control biológico",
      estado: ctrlBio >= 1 ? "verde" : "amarillo",
    },
  ];
}

const SEMAFORO_SCORE = { verde: 2, amarillo: 1, rojo: 0 };
const SEMAFORO_LABEL = { verde: "Sostenible", amarillo: "En observación", rojo: "Requiere atención" };

/* Promedia el semáforo de todas las prácticas de todos los cultivos */
function semaforoPromedio(cultivos) {
  const estados = cultivos.flatMap((c) => buildSemaforoRows(c).map((r) => r.estado));
  if (estados.length === 0) return { estado: "amarillo", huella: 0 };
  const avg = estados.reduce((a, e) => a + SEMAFORO_SCORE[e], 0) / estados.length;
  const estado = avg >= 1.5 ? "verde" : avg >= 0.75 ? "amarillo" : "rojo";
  const huella = cultivos.reduce((a, c) => a + (c.huella_neta_kg_co2 || 0), 0);
  return { estado, huella };
}

function SemaforoAmbiental({ cultivos }) {
  const lista = cultivos || [];
  const [sel, setSel] = useState(lista[0]?.cultivo_id || "");

  if (lista.length === 0) {
    return (
      <Card pad="p-[26px]">
        <h3 className="m-0 text-[19px] font-extrabold text-text">Sostenibilidad ambiental por práctica</h3>
        <p className="mb-4 mt-1 text-[13.5px] text-muted-2">Semáforo ambiental por cultivo</p>
        <EmptyState icon="leaf" title="Sin datos ambientales" desc="Registra prácticas y huella de carbono en tus cultivos para ver el semáforo." />
      </Card>
    );
  }

  const cultivo = lista.find((c) => c.cultivo_id === sel) || lista[0];
  const rows = buildSemaforoRows(cultivo);
  const enOptimo = rows.filter((r) => r.estado === "verde").length;
  const sostenible = enOptimo >= 3;

  const prom = semaforoPromedio(lista);
  const promColor = SEMAFORO_COLORS[prom.estado];
  const promHuellaTxt = `${prom.huella <= 0 ? "−" : "+"}${Math.abs(prom.huella).toFixed(1)} kg CO₂`;

  return (
    <Card pad="p-[26px]" className="flex flex-col">
      <div className="mb-1 flex items-start justify-between gap-3">
        <h3 className="m-0 text-[19px] font-extrabold text-text">Sostenibilidad ambiental por práctica</h3>
        <span
          className="flex flex-shrink-0 items-center gap-[6px] rounded-full px-[11px] py-[5px] text-[12.5px] font-extrabold"
          style={
            sostenible
              ? { background: "#dcefd7", color: "#2f6b34" }
              : { background: "#fbf0c9", color: "#8a6b16" }
          }
        >
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: sostenible ? "#3f9a48" : "#e2b53a" }} />
          {sostenible ? "Sostenible" : "En observación"}
        </span>
      </div>

      {/* Filtro por cultivo */}
      <div className="mb-1 mt-[10px] flex items-center gap-[10px]">
        <span className="whitespace-nowrap text-[13px] font-bold text-muted-2">Cultivo</span>
        <Select value={cultivo.cultivo_id} onChange={(e) => setSel(e.target.value)} className="flex-1">
          {lista.map((c) => (
            <option key={c.cultivo_id} value={c.cultivo_id}>
              {c.especie}
              {c.biohuerto ? ` · ${c.biohuerto}` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-1 flex-1">
        {rows.map((r) => (
          <PracticaRow key={r.titulo} {...r} />
        ))}
      </div>

      {/* Semáforo ambiental promedio del biohuerto */}
      <div className="mt-[10px] flex items-center gap-4 rounded-[14px] border border-line bg-chip-2 px-[16px] py-[14px]">
        <MiniSemaforo estado={prom.estado} />
        <div className="min-w-0">
          <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted-2">Semáforo ambiental promedio</div>
          <div className="text-[16px] font-extrabold leading-tight" style={{ color: promColor }}>
            {SEMAFORO_LABEL[prom.estado]}
          </div>
          <div className="mt-[2px] text-[12.5px] font-semibold text-muted-1">
            Promedio de {lista.length} {lista.length === 1 ? "cultivo" : "cultivos"} · Huella neta {promHuellaTxt}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---- Eco card ---- */
function EcoCard({ icon, tint, titulo, valor, sub, positive }) {
  return (
    <Card pad="p-[22px]" className="flex h-full flex-col justify-center">
      <div className="flex items-center gap-4">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl text-white" style={{ background: tintGradient(tint) }}>
          <Icon name={icon} size={22} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-muted-2">{titulo}</div>
          <div className="mt-[2px] text-2xl font-extrabold text-text">{valor}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-[6px] text-[13px] font-bold" style={{ color: positive ? "#2f8a3e" : "var(--muted-2)" }}>
        {positive && <Icon name="check" size={15} stroke={2.4} />}
        {sub}
      </div>
    </Card>
  );
}

/* ---- Contenido del reporte (preview) ---- */
function ReporteContenido({ r }) {
  const { data } = r;
  const Row = ({ label, value }) => (
    <div className="flex justify-between border-b border-line py-[9px] text-sm">
      <span className="font-semibold text-muted-1">{label}</span>
      <span className="font-extrabold text-text">{value}</span>
    </div>
  );
  const Sec = ({ title, children }) => (
    <section>
      <h4 className="m-0 mb-[6px] text-[13px] font-extrabold uppercase tracking-[.05em] text-primary">{title}</h4>
      {children}
    </section>
  );
  return (
    <div className="grid gap-[22px]">
      <Sec title="Producción">
        <Row label="Cultivos activos" value={r.totalCultivos} />
        {r.porEtapa
          .filter((e) => e.n > 0)
          .map((e) => (
            <Row key={e.etapa} label={`· ${(ETAPAS[e.etapa] || {}).label || e.etapa}`} value={`${e.n} cultivo${e.n === 1 ? "" : "s"}`} />
          ))}
      </Sec>
      <Sec title="Próximas cosechas">
        {data.proximas_cosechas.map((c) => (
          <Row key={c.cultivo_id} label={`${c.especie} · ${c.biohuerto}`} value={fmtFecha(c.fecha_estimada_cosecha)} />
        ))}
      </Sec>
      <Sec title="Costos acumulados">
        {r.costBars.map((c) => (
          <Row key={c.label} label={c.label} value={fmtMoneda(c.value)} />
        ))}
        <Row label="Total invertido" value={fmtMoneda(data.costo_total)} />
      </Sec>
      <Sec title="Alertas pendientes">
        <Row label="Prioridad alta" value={data.alertas_pendientes.alta} />
        <Row label="Prioridad media" value={data.alertas_pendientes.media} />
        <Row label="Prioridad baja" value={data.alertas_pendientes.baja} />
      </Sec>
      <Sec title="Sostenibilidad">
        <Row label="Índice de prácticas sostenibles" value={`${data.sostenibilidad.score}%`} />
        <Row label="Prácticas sostenibles" value={`${data.sostenibilidad.sostenibles} de ${data.sostenibilidad.total}`} />
        <Row label="Huella de carbono" value={`${(data.huella_total_kg_co2 / 1000).toFixed(2)} t CO₂e`} />
        <Row label="Compost aplicado" value={`${data.compost_kg.toFixed(0)} kg`} />
        <Row label="Costo de agua acumulado" value={fmtMoneda(data.costo_agua)} />
      </Sec>
    </div>
  );
}

/* ---- Genera y DESCARGA el reporte como PDF (directo, sin diálogo) ---- */
function descargarReporte(r, toast) {
  const { data } = r;
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

  const GREEN = [47, 122, 58];
  const GRAY = [107, 117, 108];
  const LINE = [230, 235, 229];
  const TEXT = [28, 42, 32];
  const MUTE = [154, 163, 154];

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = M;
  const ensure = (h) => {
    if (y + h > pageH - M) {
      doc.addPage();
      y = M;
    }
  };

  // Cabecera
  doc.setFillColor(...GREEN);
  doc.roundedRect(M, y, 34, 34, 8, 8, "F");
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Reporte resumido del biohuerto", M + 46, y + 15);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Gestion sostenible · Campana actual", M + 46, y + 30);
  y += 34 + 14;
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(2);
  doc.line(M, y, pageW - M, y);
  y += 16;
  doc.setTextColor(...GRAY);
  doc.setFontSize(9.5);
  doc.text(`Generado el ${fecha}`, M, y);
  y += 22;

  const seccion = (titulo, filas) => {
    if (filas.length === 0) return;
    ensure(46);
    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(titulo.toUpperCase(), M, y);
    y += 12;
    filas.forEach(([l, v]) => {
      ensure(24);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...TEXT);
      doc.text(String(l), M, y);
      doc.setFont("helvetica", "bold");
      doc.text(String(v), pageW - M, y, { align: "right" });
      y += 8;
      doc.setDrawColor(...LINE);
      doc.setLineWidth(1);
      doc.line(M, y, pageW - M, y);
      y += 13;
    });
    y += 12;
  };

  seccion("Produccion", [
    ["Cultivos activos", r.totalCultivos],
    ...r.porEtapa
      .filter((e) => e.n > 0)
      .map((e) => ["· " + ((ETAPAS[e.etapa] || {}).label || e.etapa), e.n + " cultivo" + (e.n === 1 ? "" : "s")]),
  ]);
  seccion(
    "Proximas cosechas",
    data.proximas_cosechas.map((c) => [c.especie + " · " + c.biohuerto, fmtFecha(c.fecha_estimada_cosecha)]),
  );
  seccion("Costos acumulados", [
    ...r.costBars.map((c) => [c.label, fmtMoneda(c.value)]),
    ["Total invertido", fmtMoneda(data.costo_total)],
  ]);
  seccion("Alertas pendientes", [
    ["Prioridad alta", data.alertas_pendientes.alta],
    ["Prioridad media", data.alertas_pendientes.media],
    ["Prioridad baja", data.alertas_pendientes.baja],
  ]);
  seccion("Sostenibilidad", [
    ["Indice de practicas sostenibles", data.sostenibilidad.score + "%"],
    ["Practicas sostenibles", data.sostenibilidad.sostenibles + " de " + data.sostenibilidad.total],
    ["Huella de carbono", (data.huella_total_kg_co2 / 1000).toFixed(2) + " t CO2e"],
    ["Compost aplicado", data.compost_kg.toFixed(0) + " kg"],
    ["Costo de agua acumulado", fmtMoneda(data.costo_agua)],
  ]);

  doc.setTextColor(...MUTE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Biohuerto — Plataforma de gestion sostenible · Documento generado automaticamente",
    pageW / 2,
    pageH - 28,
    { align: "center" },
  );

  doc.save(`Reporte-Biohuerto-${new Date().toISOString().slice(0, 10)}.pdf`);
  toast && toast("Reporte PDF descargado");
}
