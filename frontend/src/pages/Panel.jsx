import { useEffect, useState } from "react";
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
  const sost = data.sostenibilidad || { sostenibles: 0, total: 0, score: 0 };
  const huellaT = (data.huella_total_kg_co2 || 0) / 1000;

  const reporte = { data, costBars, porEtapa, totalCultivos, horizonte };

  return (
    <div className="animate-fade">
      <PageHeader title="Panel" subtitle="Resumen del estado productivo, alertas y sostenibilidad del biohuerto." />

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

      {/* Fila 2: costos | semáforo */}
      <div className="mb-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
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

        <Card pad="p-[26px]" className="!border-accent-100 bg-gradient-to-br from-accent-50 to-white">
          <h3 className="m-0 text-[19px] font-extrabold text-text">Semáforo ambiental</h3>
          <p className="mb-[18px] mt-1 text-[13.5px] text-muted-2">Índice de prácticas sostenibles</p>
          <div className="mb-[10px] grid place-items-center">
            <Gauge value={sost.score} />
          </div>
          <div className="mb-4 flex justify-center gap-2">
            {["#d6584a", "#e2b53a", "#3f9a48"].map((c, i) => (
              <span
                key={i}
                className="h-2 w-11 rounded-full"
                style={{
                  background: c,
                  opacity:
                    (sost.score < 40 && i === 0) ||
                    (sost.score >= 40 && sost.score < 70 && i === 1) ||
                    (sost.score >= 70 && i === 2)
                      ? 1
                      : 0.25,
                }}
              />
            ))}
          </div>
          <p className="m-0 text-center text-[13.5px] leading-[1.5] text-accent-800">
            <strong>
              {sost.sostenibles} de {sost.total}
            </strong>{" "}
            prácticas registradas son sostenibles.
          </p>
        </Card>
      </div>

      {/* Fila 3: eco cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        <EcoCard icon="recycle" tint="albahaca" titulo="Huella de carbono" valor={`${huellaT.toFixed(2)} t CO₂e`} sub="huella neta · periodo actual" positive />
        <EcoCard icon="seedling" tint="zanahoria" titulo="Compost aplicado" valor={`${data.compost_kg.toFixed(0)} kg`} sub="compost registrado en el periodo" />
        <EcoCard icon="drop" tint="espinaca" titulo="Costo de agua acumulado" valor={fmtMoneda(data.costo_agua)} sub="categoría Agua en costeo de cultivos" />
      </div>

      {/* Reporte resumido */}
      <Card pad="p-6" className="mt-6 flex flex-wrap items-center justify-between gap-5">
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

/* ---- Gauge semicircular ---- */
function Gauge({ value }) {
  const r = 58;
  const circ = Math.PI * r;
  const color = value >= 70 ? "#3f9a48" : value >= 40 ? "#e2b53a" : "#d6584a";
  return (
    <div className="relative h-24 w-40">
      <svg width="160" height="96" viewBox="0 0 160 96">
        <path d={`M16 88 A ${r} ${r} 0 0 1 144 88`} fill="none" stroke="#e2e8de" strokeWidth="14" strokeLinecap="round" />
        <path
          d={`M16 88 A ${r} ${r} 0 0 1 144 88`}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - value / 100)}
        />
      </svg>
      <div className="absolute bottom-0 left-0 right-0 text-center">
        <div className="text-[34px] font-extrabold leading-none" style={{ color }}>
          {value}%
        </div>
        <div className="mt-[2px] text-xs font-bold uppercase tracking-[.05em] text-muted-2">Sostenible</div>
      </div>
    </div>
  );
}

/* ---- Eco card ---- */
function EcoCard({ icon, tint, titulo, valor, sub, positive }) {
  return (
    <Card pad="p-[22px]">
      <span className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ background: tintGradient(tint) }}>
        <Icon name={icon} size={22} />
      </span>
      <div className="mt-4 text-sm font-bold text-muted-2">{titulo}</div>
      <div className="mt-1 text-2xl font-extrabold text-text">{valor}</div>
      <div className="mt-2 flex items-center gap-[6px] text-[13px] font-bold" style={{ color: positive ? "#2f8a3e" : "var(--muted-2)" }}>
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

/* ---- Genera y abre el reporte para imprimir / guardar como PDF ---- */
function descargarReporte(r, toast) {
  const { data } = r;
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const fila = (l, v) => `<tr><td>${l}</td><td class="v">${v}</td></tr>`;
  const seccion = (titulo, filas) => `<h2>${titulo}</h2><table>${filas}</table>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte resumido — Biohuerto</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2a20;margin:0;padding:48px;max-width:760px}
  .head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #2f7a3a;padding-bottom:18px;margin-bottom:8px}
  .logo{width:46px;height:46px;border-radius:12px;background:#2f7a3a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800}
  h1{font-size:24px;margin:0;color:#2f7a3a} .sub{color:#6b756c;font-size:13px;margin-top:24px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#2f7a3a;margin:26px 0 8px}
  table{width:100%;border-collapse:collapse} td{padding:8px 0;border-bottom:1px solid #e6ebe5;font-size:14px}
  td.v{text-align:right;font-weight:800} .total td{border-top:2px solid #cfe8cd;font-weight:800}
  .foot{margin-top:34px;color:#9aa39a;font-size:12px;text-align:center}
  @media print{body{padding:24px}}
</style></head><body>
  <div class="head"><div class="logo">🌱</div><div><h1>Reporte resumido del biohuerto</h1><div style="color:#6b756c;font-size:13px">Gestión sostenible · Campaña actual</div></div></div>
  <div class="sub">Generado el ${fecha}</div>
  ${seccion("Producción", fila("Cultivos activos", r.totalCultivos) + r.porEtapa.filter((e) => e.n > 0).map((e) => fila("· " + ((ETAPAS[e.etapa] || {}).label || e.etapa), e.n + " cultivo" + (e.n === 1 ? "" : "s"))).join(""))}
  ${seccion("Próximas cosechas", data.proximas_cosechas.map((c) => fila(c.especie + " · " + c.biohuerto, fmtFecha(c.fecha_estimada_cosecha))).join(""))}
  ${seccion("Costos acumulados", r.costBars.map((c) => fila(c.label, fmtMoneda(c.value))).join("") + `<tr class="total"><td>Total invertido</td><td class="v">${fmtMoneda(data.costo_total)}</td></tr>`)}
  ${seccion("Alertas pendientes", fila("Prioridad alta", data.alertas_pendientes.alta) + fila("Prioridad media", data.alertas_pendientes.media) + fila("Prioridad baja", data.alertas_pendientes.baja))}
  ${seccion("Sostenibilidad", fila("Índice de prácticas sostenibles", data.sostenibilidad.score + "%") + fila("Prácticas sostenibles", data.sostenibilidad.sostenibles + " de " + data.sostenibilidad.total) + fila("Huella de carbono", (data.huella_total_kg_co2 / 1000).toFixed(2) + " t CO₂e") + fila("Compost aplicado", data.compost_kg.toFixed(0) + " kg") + fila("Costo de agua acumulado", fmtMoneda(data.costo_agua)))}
  <div class="foot">Biohuerto — Plataforma de gestión sostenible · Documento generado automáticamente</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 350);
    toast && toast("Abriendo reporte para guardar como PDF…");
  } else {
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Reporte-Biohuerto.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast && toast("Reporte descargado");
  }
}
