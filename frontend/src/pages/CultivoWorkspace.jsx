import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  EstadoIncidenciaBadge,
  EtapaBadge,
  Field,
  Icon,
  IconBtn,
  Input,
  Modal,
  Select,
  SeveridadBadge,
  Textarea,
  Toggle,
} from "../components/ui/primitives.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import { fmtFecha, fmtMoneda, tintGradient, tintFor } from "../lib/theme.js";
import {
  cultivosApi,
  cuidadosApi,
  diagnosticoApi,
  incidenciasApi,
  monitoreoApi,
  recomendacionesApi,
  trazabilidadApi,
} from "../lib/resources.js";

/* ============ Tokens locales ============ */
const RIESGOS = {
  bajo: { bg: "#dcefd7", fg: "#2f6b34", dot: "#3f9a48", label: "Riesgo bajo" },
  medio: { bg: "#fbf0c9", fg: "#8a6b16", dot: "#e2b53a", label: "Riesgo medio" },
  alto: { bg: "#fbe1de", fg: "#b23a2e", dot: "#d6584a", label: "Riesgo alto" },
};
const REC_PRIORIDAD = {
  urgente: { bg: "#fbe1de", fg: "#b23a2e", dot: "#d6584a", label: "Urgente", icon: "alertTri" },
  importante: { bg: "#fbf0c9", fg: "#8a6b16", dot: "#e2b53a", label: "Importante", icon: "drop" },
  recomendada: { bg: "#dcefd7", fg: "#2f6b34", dot: "#3f9a48", label: "Recomendada", icon: "leaf" },
};
const esSano = (d) => (d.resultado || "").startsWith("Planta sana");

const PRACT_CAT = {
  organico: { bg: "#dcefd7", fg: "#2f6b34", dot: "#3f9a48", label: "Orgánica", icon: "recycle" },
  cultural: { bg: "#e7eefb", fg: "#33559e", dot: "#5b7fd6", label: "Cultural", icon: "drop" },
  biologico: { bg: "#d7efe9", fg: "#1f7a5e", dot: "#2fa07e", label: "Biológica", icon: "leaf" },
};
const COSTO_CAT = {
  Insumos: { bg: "#fbf0c9", fg: "#8a6b16", dot: "#e2b53a" },
  "Mano de obra": { bg: "#ece7fb", fg: "#5b46a3", dot: "#8b6fc9" },
  Agua: { bg: "#e7eefb", fg: "#33559e", dot: "#5b7fd6" },
};

const CULTIVO_SECTIONS = [
  { id: "monitoreo", label: "Monitoreo", icon: "activity" },
  { id: "diagnostico", label: "Fitosanitario", icon: "stethoscope" },
  { id: "incidencias", label: "Incidencias", icon: "alertTri" },
  { id: "recomendaciones", label: "Recomendaciones", icon: "bulb" },
  { id: "practicas", label: "Prácticas", icon: "recycle" },
  { id: "costos", label: "Costos", icon: "coins" },
  { id: "cuidados", label: "Cuidados", icon: "drop" },
];

const TIPOS_INCIDENCIA = ["Plaga", "Enfermedad", "Clima adverso", "Daño físico", "Deficiencia nutricional", "Otro"];

const TIPOS_CUIDADO = [
  { value: "Riego", icon: "drop" },
  { value: "Fertilización", icon: "leaf" },
  { value: "Control preventivo", icon: "stethoscope" },
  { value: "Otro", icon: "clipboard" },
];

/* ============ Helpers ============ */
function fechaHora(s) {
  if (!s) return "—";
  const dt = new Date(s);
  if (isNaN(dt)) return s;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} · ${hh}:${mi}`;
}

/* ============ Table primitives (inline) ============ */
function Table({ head, cols, children }) {
  return (
    <div>
      <div
        className="grid items-center gap-4 border-b border-line bg-chip/40 px-[26px] py-[14px]"
        style={{ gridTemplateColumns: cols }}
      >
        {head.map((h, i) => (
          <span
            key={i}
            className={`text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted-2 ${
              i === head.length - 1 ? "text-right" : ""
            }`}
          >
            {h}
          </span>
        ))}
      </div>
      <div>{children}</div>
    </div>
  );
}
function Row({ cols, children }) {
  return (
    <div
      className="grid items-center gap-4 border-b border-line px-[26px] py-[15px] last:border-b-0 hover:bg-chip/30"
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}
function Cell({ children }) {
  return <div className="flex min-w-0 items-center">{children}</div>;
}

function SectionHead({ title, subtitle, action }) {
  return (
    <div className="mb-[26px] flex flex-wrap items-start justify-between gap-5">
      <div>
        <h2 className="m-0 text-[22px] font-extrabold tracking-[-.01em] text-text">{title}</h2>
        {subtitle && <p className="mt-1 text-[14.5px] text-muted-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid place-items-center py-16 text-muted-2">
      <div className="flex items-center gap-3 text-[14.5px] font-semibold">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" />
        Cargando…
      </div>
    </div>
  );
}

/* ============ Sección: Monitoreo ============ */
function MonitorCard({ titulo, valor, unidad, texto, sub, icon, empty }) {
  return (
    <Card
      pad="p-5"
      className={`flex flex-col ${empty ? "border-[1.5px] border-dashed border-line-2 bg-white/50" : ""}`}
    >
      <div className="mb-4 flex items-center justify-between gap-[10px]">
        <span className={`text-[14.5px] font-bold ${empty ? "text-muted-2" : "text-text"}`}>{titulo}</span>
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent-50 text-primary">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className="flex-1">
        {empty ? (
          <>
            <div className="text-[21px] font-extrabold leading-[1.1] text-muted-3">No registrado</div>
            <div className="mt-[6px] text-[13px] text-muted-2">{sub}</div>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-[3px]">
              {texto ? (
                <span className="text-[30px] font-extrabold leading-none text-text">{texto || "—"}</span>
              ) : (
                <>
                  <span className="text-[34px] font-extrabold leading-none text-text">
                    {valor != null ? valor : "—"}
                  </span>
                  <span className="text-[18px] font-bold text-muted-2">{unidad}</span>
                </>
              )}
            </div>
            <div className="mt-2 text-[13px] text-muted-2">{sub}</div>
          </>
        )}
      </div>
    </Card>
  );
}
function InputUnit({ icon, value, onChange, placeholder }) {
  return (
    <div className="relative">
      <span className="absolute left-[14px] top-1/2 -translate-y-1/2 text-muted-2">
        <Icon name={icon} size={18} />
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-white py-3 pl-[42px] pr-[14px] text-[15px] text-text outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(31,90,53,.12)]"
      />
    </div>
  );
}
function SeccionMonitoreo({ cultivoId }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ humedad: "", temp: "", lux: "", ph: "", observacion: "" });

  const load = () => {
    setRows(null);
    monitoreoApi
      .list(cultivoId)
      .then(setRows)
      .catch(() => {
        toast("No se pudo cargar el monitoreo", "danger");
        setRows([]);
      });
  };
  useEffect(load, [cultivoId]);

  const last = (key) => (rows || []).find((r) => r[key] != null) || {};
  const lastHum = last("humedad_pct");
  const lastTemp = last("temperatura_c");
  const lastLux = (rows || []).find((r) => r.luminosidad_nivel) || {};
  const lastPh = last("ph_suelo");

  const openNew = () => {
    setForm({ humedad: "", temp: "", lux: "", ph: "", observacion: "" });
    setModal(true);
  };
  const save = () => {
    const { humedad, temp, lux, ph, observacion } = form;
    if (humedad === "" && temp === "" && lux === "" && ph === "" && !observacion.trim()) {
      toast("Ingresa al menos un dato", "danger");
      return;
    }
    setSaving(true);
    monitoreoApi
      .create({
        cultivo_id: cultivoId,
        humedad_pct: humedad === "" ? null : +humedad,
        temperatura_c: temp === "" ? null : +temp,
        luminosidad_lux: lux === "" ? null : +lux,
        ph_suelo: ph === "" ? null : +ph,
        observacion: observacion.trim() || null,
      })
      .then(() => {
        toast("Registro de monitoreo guardado");
        setModal(false);
        load();
      })
      .catch(() => toast("No se pudo guardar el registro", "danger"))
      .finally(() => setSaving(false));
  };

  const cols = "1.1fr .8fr 2fr 1fr";

  return (
    <div>
      <SectionHead
        title="Monitoreo"
        subtitle="Variables ambientales del cultivo"
        action={<Button icon="plus" onClick={openNew}>Registro completo</Button>}
      />

      {rows === null ? (
        <Loading />
      ) : (
        <>
          <div className="mb-[30px] grid grid-cols-2 gap-[18px] md:grid-cols-4">
            <MonitorCard
              titulo="Humedad"
              valor={lastHum.humedad_pct != null ? Number(lastHum.humedad_pct) : null}
              unidad="%"
              sub="Humedad relativa"
              icon="drop"
              empty={lastHum.humedad_pct == null}
            />
            <MonitorCard
              titulo="Temperatura"
              valor={lastTemp.temperatura_c != null ? Number(lastTemp.temperatura_c) : null}
              unidad="°C"
              sub="Temperatura ambiente"
              icon="thermo"
              empty={lastTemp.temperatura_c == null}
            />
            <MonitorCard
              titulo="Luminosidad"
              texto={lastLux.luminosidad_nivel}
              sub="Nivel de luz estimado"
              icon="sun"
              empty={!lastLux.luminosidad_nivel}
            />
            <MonitorCard
              titulo="pH del suelo"
              valor={lastPh.ph_suelo != null ? Number(lastPh.ph_suelo) : null}
              unidad=""
              sub="Disponible para sensor o ingreso manual"
              icon="flask"
              empty={lastPh.ph_suelo == null}
            />
          </div>

          <h3 className="mb-4 text-[13px] font-extrabold uppercase tracking-[.06em] text-muted-2">
            Historial de mediciones
          </h3>

          {rows.length === 0 ? (
            <EmptyState
              icon="activity"
              title="Aún no hay mediciones"
              desc="Registra la primera medición para empezar el historial."
            />
          ) : (
            <Card pad="p-0" className="overflow-hidden">
              <Table head={["Fecha / Hora", "Fuente", "Variables registradas", "Registrado por"]} cols={cols}>
                {rows.map((r) => {
                  const iot = r.fuente === "iot" || r.fuente === "IoT";
                  const cfg = iot
                    ? { bg: "#dcefd7", fg: "#2f6b34", dot: "#3f9a48", label: "IoT" }
                    : { bg: "#e7eefb", fg: "#33559e", dot: "#5b7fd6", label: "Manual" };
                  const vars = [
                    r.humedad_pct != null ? `${Number(r.humedad_pct)}% hum` : null,
                    r.temperatura_c != null ? `${Number(r.temperatura_c)} °C` : null,
                    r.luminosidad_nivel ? `Luz ${r.luminosidad_nivel.toLowerCase()}` : null,
                    r.ph_suelo != null ? `pH ${Number(r.ph_suelo)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <Row key={r.id} cols={cols}>
                      <Cell>
                        <span className="font-mono text-[13.5px] font-semibold text-text">
                          {fechaHora(r.registrado_en)}
                        </span>
                      </Cell>
                      <Cell>
                        <Badge bg={cfg.bg} fg={cfg.fg} dot={cfg.dot}>{cfg.label}</Badge>
                      </Cell>
                      <Cell>
                        <span className="text-[14px] text-muted-1">{vars || "Sin variables"}</span>
                      </Cell>
                      <Cell>
                        <span className="text-[14px] font-semibold text-muted-1">
                          {r.sensor_codigo || (iot ? "Sensor" : "Manual")}
                        </span>
                      </Cell>
                    </Row>
                  );
                })}
              </Table>
            </Card>
          )}
        </>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Registro completo"
        subtitle="Registra todas las variables ambientales del cultivo"
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button icon="check" onClick={save} disabled={saving}>Guardar registro</Button>
          </>
        }
      >
        <div className="mb-3 text-[12px] font-extrabold uppercase tracking-[.05em] text-muted-2">
          Mediciones ambientales
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Humedad (%)" hint="Opcional">
            <InputUnit icon="drop" value={form.humedad} onChange={(v) => setForm({ ...form, humedad: v })} placeholder="—" />
          </Field>
          <Field label="Temperatura (°C)" hint="Opcional">
            <InputUnit icon="thermo" value={form.temp} onChange={(v) => setForm({ ...form, temp: v })} placeholder="—" />
          </Field>
          <Field label="Luminosidad (lux)" hint="Opcional">
            <InputUnit icon="sun" value={form.lux} onChange={(v) => setForm({ ...form, lux: v })} placeholder="—" />
          </Field>
          <Field label="pH del suelo" hint="Opcional">
            <InputUnit icon="flask" value={form.ph} onChange={(v) => setForm({ ...form, ph: v })} placeholder="—" />
          </Field>
        </div>
        <div className="mb-3 mt-[22px] text-[12px] font-extrabold uppercase tracking-[.05em] text-muted-2">
          Observación
        </div>
        <Field label="Observación general" hint="Opcional">
          <Textarea
            value={form.observacion}
            onChange={(e) => setForm({ ...form, observacion: e.target.value })}
            placeholder="Notas generales del registro…"
          />
        </Field>
      </Modal>
    </div>
  );
}

/* ============ Sección: Diagnóstico fitosanitario ============ */
function SeccionDiagnostico({ cultivoId, cultivo }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [recomendando, setRecomendando] = useState(null);
  const [generandoGeneral, setGenerandoGeneral] = useState(false);

  useEffect(() => {
    setRows(null);
    diagnosticoApi
      .list({ cultivo_id: cultivoId })
      .then(setRows)
      .catch(() => {
        toast("No se pudo cargar el diagnóstico", "danger");
        setRows([]);
      });
  }, [cultivoId]);

  const pedirRecomendacion = async (id) => {
    setRecomendando(id);
    try {
      const actualizado = await diagnosticoApi.recomendacion(id);
      setRows((prev) => prev.map((d) => (d.id === id ? actualizado : d)));
      if (!actualizado.recomendacion) {
        toast("No se encontró una recomendación para este diagnóstico", "danger");
      }
    } catch {
      toast("No se pudo generar la recomendación ahora. Inténtalo más tarde.", "danger");
    } finally {
      setRecomendando(null);
    }
  };

  const generarRecomendacionGeneral = async () => {
    setGenerandoGeneral(true);
    try {
      await recomendacionesApi.generarGeneral(cultivoId);
      toast("Recomendación de cuidado generada. Revisa la sección Recomendaciones.");
    } catch {
      toast("No se pudo generar la recomendación ahora. Inténtalo más tarde.", "danger");
    } finally {
      setGenerandoGeneral(false);
    }
  };

  const sinEnfermedadActiva = rows !== null && rows.every((d) => esSano(d));

  return (
    <div>
      <SectionHead
        title="Diagnóstico fitosanitario"
        subtitle="Detección de enfermedades por imagen o síntomas observados"
      />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="stethoscope"
          title="Sin diagnósticos registrados"
          desc="Aún no se han ejecutado análisis para este cultivo."
          action={
            <Button icon="bulb" onClick={generarRecomendacionGeneral} disabled={generandoGeneral}>
              {generandoGeneral
                ? "Generando recomendación…"
                : `Generar recomendación de cuidado para ${cultivo?.especie || "este cultivo"}`}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((d) => {
            const r = RIESGOS[d.riesgo] || RIESGOS.bajo;
            const sano = esSano(d);
            return (
              <Card key={d.id} pad="p-[18px]">
                <div className="flex flex-wrap items-center gap-4">
                  <span
                    className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl text-white"
                    style={{ background: r.dot }}
                  >
                    <Icon name="stethoscope" size={21} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[16px] font-extrabold text-text">{d.resultado || "Sin resultado"}</span>
                      <Badge bg={r.bg} fg={r.fg} dot={r.dot}>{r.label}</Badge>
                      {d.guardado && <Badge bg="#dcefd7" fg="#2f6b34" dot="#3f9a48">Guardado</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-2">
                      {d.nombre_cientifico && <span className="italic">{d.nombre_cientifico}</span>}
                      <span>Parte: {d.parte_planta}</span>
                      {d.modelo && <span>Modelo: {d.modelo}</span>}
                      {d.confianza != null && (
                        <span className="font-semibold text-muted-1">{Math.round(Number(d.confianza))}% confianza</span>
                      )}
                    </div>
                    {Array.isArray(d.alternativas) && d.alternativas.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {d.alternativas.map((a, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-2 rounded-lg bg-chip px-[10px] py-[5px] text-[12.5px] font-semibold text-muted-1"
                          >
                            {a.enfermedad}
                            {a.confianza_pct != null && (
                              <span className="font-mono text-muted-3">{Math.round(Number(a.confianza_pct))}%</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {d.recomendacion ? (
                      <div className="mt-3 rounded-xl bg-chip p-3">
                        <p className="m-0 text-[12.5px] font-bold text-muted-2">Recomendación de manejo:</p>
                        <p className="m-0 mt-1 whitespace-pre-line text-[13.5px] text-text">{d.recomendacion}</p>
                      </div>
                    ) : (
                      !sano && (
                        <div className="mt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="bulb"
                            onClick={() => pedirRecomendacion(d.id)}
                            disabled={recomendando === d.id}
                          >
                            {recomendando === d.id ? "Generando recomendación…" : "Recomendación"}
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                  <span className="ml-auto font-mono text-[13px] text-muted-2">{fmtFecha(d.fecha)}</span>
                </div>
              </Card>
            );
          })}
          {sinEnfermedadActiva && (
            <Card pad="p-[18px]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-[14.5px] font-extrabold text-text">
                    Este cultivo no tiene enfermedades activas
                  </p>
                  <p className="m-0 mt-1 text-[13px] text-muted-2">
                    Genera una recomendación general de cuidado para {cultivo?.especie || "este cultivo"}.
                  </p>
                </div>
                <Button icon="bulb" onClick={generarRecomendacionGeneral} disabled={generandoGeneral}>
                  {generandoGeneral ? "Generando recomendación…" : "Generar recomendación de cuidado"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ============ Sección: Incidencias ============ */
function SeccionIncidencias({ cultivoId }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filtros, setFiltros] = useState({
    busqueda: "",
    tipo: "",
    severidad: "",
    estado: "",
    desde: "",
    hasta: "",
  });
  const blankForm = {
    tipo: TIPOS_INCIDENCIA[0],
    descripcion: "",
    severidad: "media",
    zona_afectada: "",
    estado: "abierta",
  };
  const [form, setForm] = useState(blankForm);

  const load = () => {
    setRows(null);
    incidenciasApi
      .list(cultivoId)
      .then(setRows)
      .catch(() => {
        toast("No se pudieron cargar las incidencias", "danger");
        setRows([]);
      });
  };
  useEffect(load, [cultivoId]);

  const openNew = () => {
    setEditing(null);
    setForm(blankForm);
    setModal(true);
  };
  const openEdit = (i) => {
    setEditing(i);
    setForm({
      tipo: i.tipo,
      descripcion: i.descripcion,
      severidad: i.severidad,
      zona_afectada: i.zona_afectada || "",
      estado: i.estado,
    });
    setModal(true);
  };

  const save = () => {
    if (!form.descripcion.trim()) {
      toast("Ingresa una descripción", "danger");
      return;
    }
    setSaving(true);
    const payload = {
      tipo: form.tipo,
      descripcion: form.descripcion.trim(),
      severidad: form.severidad,
      zona_afectada: form.zona_afectada.trim() || null,
      estado: form.estado,
    };
    const req = editing
      ? incidenciasApi.update(editing.id, payload)
      : incidenciasApi.create({ cultivo_id: cultivoId, ...payload });
    req
      .then(() => {
        toast(editing ? "Incidencia actualizada" : "Incidencia registrada");
        setModal(false);
        load();
      })
      .catch(() => toast("No se pudo guardar la incidencia", "danger"))
      .finally(() => setSaving(false));
  };

  const marcarResuelta = (i) => {
    incidenciasApi
      .update(i.id, { estado: "cerrada" })
      .then(() => {
        toast("Incidencia marcada como resuelta");
        load();
      })
      .catch(() => toast("No se pudo actualizar la incidencia", "danger"));
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    incidenciasApi
      .remove(toDelete.id)
      .then(() => {
        toast("Incidencia eliminada");
        setToDelete(null);
        load();
      })
      .catch(() => toast("No se pudo eliminar la incidencia", "danger"));
  };

  const filtered = (rows || []).filter((i) => {
    if (filtros.tipo && i.tipo !== filtros.tipo) return false;
    if (filtros.severidad && i.severidad !== filtros.severidad) return false;
    if (filtros.estado && i.estado !== filtros.estado) return false;
    if (filtros.busqueda) {
      const q = filtros.busqueda.toLowerCase();
      const hay = `${i.descripcion} ${i.zona_afectada || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const fecha = (i.reportado_en || "").slice(0, 10);
    if (filtros.desde && fecha < filtros.desde) return false;
    if (filtros.hasta && fecha > filtros.hasta) return false;
    return true;
  });

  const cols = "0.85fr 0.95fr 0.85fr 2fr 1fr 0.95fr 0.9fr";

  return (
    <div>
      <SectionHead
        title="Gestión de incidencias"
        subtitle="Registro de plagas, enfermedades y eventos que afectan al cultivo"
        action={<Button icon="plus" onClick={openNew}>Registrar incidencia</Button>}
      />

      <Card pad="p-4" className="mb-[18px]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Field label="Búsqueda">
            <Input
              value={filtros.busqueda}
              onChange={(e) => setFiltros({ ...filtros, busqueda: e.target.value })}
              placeholder="Descripción o zona…"
            />
          </Field>
          <Field label="Tipo">
            <Select value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
              <option value="">Todos</option>
              {TIPOS_INCIDENCIA.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Severidad">
            <Select value={filtros.severidad} onChange={(e) => setFiltros({ ...filtros, severidad: e.target.value })}>
              <option value="">Todas</option>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
              <option value="">Todos</option>
              <option value="abierta">Abierta</option>
              <option value="en_revision">En revisión</option>
              <option value="cerrada">Cerrada</option>
            </Select>
          </Field>
          <Field label="Desde">
            <Input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
          </Field>
        </div>
      </Card>

      {rows === null ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="alertTri"
          title="Sin incidencias registradas"
          desc="Registra una incidencia cuando detectes plagas, enfermedades u otros eventos en el cultivo."
          action={<Button icon="plus" onClick={openNew}>Registrar incidencia</Button>}
        />
      ) : (
        <Card pad="p-0" className="overflow-hidden">
          <Table head={["Fecha", "Tipo", "Severidad", "Descripción", "Zona afectada", "Estado", "Acciones"]} cols={cols}>
            {filtered.map((i) => (
              <Row key={i.id} cols={cols}>
                <Cell>
                  <span className="font-mono text-[13px] font-bold text-text">{fmtFecha(i.reportado_en)}</span>
                </Cell>
                <Cell>
                  <span className="text-[13.5px] font-semibold text-muted-1">{i.tipo}</span>
                </Cell>
                <Cell>
                  <SeveridadBadge severidad={i.severidad} />
                </Cell>
                <Cell>
                  <span className="truncate text-[14px] text-muted-1">{i.descripcion}</span>
                </Cell>
                <Cell>
                  <span className="text-[13.5px] text-muted-2">{i.zona_afectada || "—"}</span>
                </Cell>
                <Cell>
                  <EstadoIncidenciaBadge estado={i.estado} />
                </Cell>
                <Cell>
                  <div className="flex items-center gap-1">
                    <IconBtn name="eye" title="Ver detalle" onClick={() => setViewing(i)} />
                    <IconBtn name="edit" title="Editar" onClick={() => openEdit(i)} />
                    {i.estado !== "cerrada" && (
                      <IconBtn name="check" title="Marcar resuelta" onClick={() => marcarResuelta(i)} />
                    )}
                    <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => setToDelete(i)} />
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        </Card>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? "Editar incidencia" : "Registrar incidencia"}
        subtitle="Documenta el evento detectado en el cultivo"
        width={580}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button icon="check" onClick={save} disabled={saving}>
              {editing ? "Guardar cambios" : "Registrar incidencia"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de incidencia">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS_INCIDENCIA.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Severidad">
            <Select value={form.severidad} onChange={(e) => setForm({ ...form, severidad: e.target.value })}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </Select>
          </Field>
        </div>
        <Field label="Descripción" className="mt-[14px]">
          <Textarea
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Describe lo observado…"
          />
        </Field>
        <div className="mt-[14px] grid grid-cols-2 gap-4">
          <Field label="Zona afectada">
            <Input
              value={form.zona_afectada}
              onChange={(e) => setForm({ ...form, zona_afectada: e.target.value })}
              placeholder="Ej: Sector norte"
            />
          </Field>
          <Field label="Estado">
            <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              <option value="abierta">Abierta</option>
              <option value="en_revision">En revisión</option>
              <option value="cerrada">Cerrada</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title="Detalle de la incidencia"
        width={520}
        footer={<Button variant="ghost" onClick={() => setViewing(null)}>Cerrar</Button>}
      >
        {viewing && (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-[10px]">
              <Badge bg="#e7eefb" fg="#33559e" dot="#5b7fd6">{viewing.tipo}</Badge>
              <SeveridadBadge severidad={viewing.severidad} />
              <EstadoIncidenciaBadge estado={viewing.estado} />
            </div>
            <p className="m-0 text-[14.5px] leading-[1.6] text-muted-1 [text-wrap:pretty]">{viewing.descripcion}</p>
            <div className="grid grid-cols-2 gap-3 text-[13.5px] text-muted-2">
              <div>
                <span className="font-bold text-muted-1">Zona afectada: </span>
                {viewing.zona_afectada || "—"}
              </div>
              <div>
                <span className="font-bold text-muted-1">Fecha: </span>
                {fmtFecha(viewing.reportado_en)}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        question="¿Eliminar esta incidencia?"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </div>
  );
}

/* ============ Sección: Recomendaciones ============ */
const fmtCronometro = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function SeccionRecomendaciones({ cultivoId, cultivo }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [transcurrido, setTranscurrido] = useState(0);

  const cargar = () => {
    setRows(null);
    recomendacionesApi
      .list({ cultivo_id: cultivoId })
      .then(setRows)
      .catch(() => {
        toast("No se pudieron cargar las recomendaciones", "danger");
        setRows([]);
      });
  };
  useEffect(cargar, [cultivoId]);

  // Cronómetro en vivo mientras la IA genera la recomendación.
  useEffect(() => {
    if (!generando) return;
    const id = setInterval(() => setTranscurrido((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [generando]);

  const generar = async () => {
    setTranscurrido(0);
    setGenerando(true);
    const inicio = performance.now();
    try {
      const nueva = await recomendacionesApi.generarGeneral(cultivoId);
      setRows((prev) => [nueva, ...(prev || [])]);
      const segs = Math.round((performance.now() - inicio) / 1000);
      toast(`Recomendación generada con IA en ${fmtCronometro(segs)} min`);
    } catch {
      toast("No se pudo generar la recomendación ahora. Inténtalo más tarde.", "danger");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div>
      <SectionHead
        title="Recomendaciones"
        subtitle="Acciones sugeridas según etapa, monitoreo y diagnóstico"
        action={
          <Button icon="bulb" onClick={generar} disabled={generando}>
            {generando
              ? `Generando recomendación… ${fmtCronometro(transcurrido)}`
              : `Generar recomendación${cultivo?.especie ? ` para ${cultivo.especie}` : ""}`}
          </Button>
        }
      />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon="bulb" title="Sin recomendaciones" desc="Aún no se han generado recomendaciones para este cultivo." />
      ) : (
        <>
          <div className="mb-4 text-[13px] font-extrabold uppercase tracking-[.05em] text-muted-2">
            {rows.length} recomendaciones
          </div>
          <div className="grid gap-[14px]">
            {rows.map((r) => {
              const p = REC_PRIORIDAD[r.prioridad] || REC_PRIORIDAD.recomendada;
              return (
                <Card key={r.id} pad="p-[22px]">
                  <div className="flex items-start gap-4">
                    <span
                      className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl"
                      style={{ background: p.bg, color: p.fg }}
                    >
                      <Icon name={p.icon} size={21} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-[14px]">
                        <div className="flex flex-wrap items-center gap-[10px]">
                          <h4 className="m-0 text-[16.5px] font-extrabold text-text">{r.titulo}</h4>
                          <Badge bg={p.bg} fg={p.fg} dot={p.dot}>{p.label}</Badge>
                        </div>
                        <span className="whitespace-nowrap text-[12.5px] font-semibold text-muted-3">
                          {r.categoria}
                        </span>
                      </div>
                      <p className="m-0 mt-[10px] text-[14px] leading-[1.6] text-muted-1 [text-wrap:pretty]">
                        {r.descripcion}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-[14px]">
                        <span className="inline-flex items-center gap-[7px] text-[12.5px] font-semibold text-muted-2">
                          <Icon name="clipboard" size={14} />
                          {r.tipo}
                        </span>
                        <span className="font-mono text-[12.5px] text-muted-3">{fmtFecha(r.fecha)}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ============ Sección: Prácticas / Trazabilidad ============ */
function SeccionPracticas({ cultivoId }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    tipo: "",
    descripcion: "",
    insumo: "",
    cantidad: "",
    unidad: "",
    fecha: new Date().toISOString().slice(0, 10),
  });

  const load = () => {
    setRows(null);
    trazabilidadApi
      .practicas(cultivoId)
      .then(setRows)
      .catch(() => {
        toast("No se pudieron cargar las prácticas", "danger");
        setRows([]);
      });
  };
  useEffect(load, [cultivoId]);

  const openNew = () => {
    setForm({
      tipo: "",
      descripcion: "",
      insumo: "",
      cantidad: "",
      unidad: "",
      fecha: new Date().toISOString().slice(0, 10),
    });
    setModal(true);
  };
  const save = () => {
    if (!form.tipo.trim() || !form.descripcion.trim()) {
      toast("Completa tipo y descripción", "danger");
      return;
    }
    setSaving(true);
    trazabilidadApi
      .crearPractica({
        cultivo_id: cultivoId,
        tipo: form.tipo.trim(),
        descripcion: form.descripcion.trim(),
        insumo: form.insumo.trim() || null,
        cantidad: form.cantidad === "" ? null : +form.cantidad,
        unidad: form.unidad.trim() || null,
        fecha: form.fecha,
      })
      .then(() => {
        toast("Práctica registrada");
        setModal(false);
        load();
      })
      .catch(() => toast("No se pudo registrar la práctica", "danger"))
      .finally(() => setSaving(false));
  };

  return (
    <div>
      <SectionHead
        title="Prácticas agrícolas"
        subtitle="Manejo agroecológico aplicado al cultivo"
        action={<Button icon="plus" onClick={openNew}>Registrar práctica</Button>}
      />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="recycle"
          title="Sin prácticas registradas"
          desc="Registra la primera práctica agroecológica del cultivo."
        />
      ) : (
        <>
          <div className="mb-4 text-[13px] font-extrabold uppercase tracking-[.05em] text-muted-2">
            {rows.length} prácticas registradas
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-[18px]">
            {rows.map((p) => {
              const cat = PRACT_CAT[p.categoria] || PRACT_CAT.cultural;
              return (
                <Card key={p.id} pad="p-5" className="flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px]"
                        style={{ background: cat.bg, color: cat.fg }}
                      >
                        <Icon name={cat.icon} size={20} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[15.5px] font-extrabold leading-[1.2] text-text">{p.tipo}</div>
                        <div className="mt-[2px] text-[12.5px] font-semibold text-muted-2">{cat.label}</div>
                      </div>
                    </div>
                    <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-muted-2">
                      {fmtFecha(p.fecha)}
                    </span>
                  </div>
                  <p className="my-4 flex-1 text-[13.5px] leading-[1.55] text-muted-1 [text-wrap:pretty]">
                    {p.descripcion}
                  </p>
                  {(p.insumo || p.cantidad != null) && (
                    <div className="mb-3 text-[13px] text-muted-2">
                      {[p.insumo, p.cantidad != null ? `${Number(p.cantidad)} ${p.unidad || ""}`.trim() : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-[10px]">
                    <Badge bg={cat.bg} fg={cat.fg} dot={cat.dot}>{cat.label}</Badge>
                    {p.sostenible && (
                      <Badge bg="#dcefd7" fg="#2f6b34" dot="#3f9a48">
                        <Icon name="recycle" size={13} />
                        Sostenible
                      </Badge>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Registrar práctica"
        subtitle="Documenta el manejo agroecológico aplicado"
        width={580}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button icon="check" onClick={save} disabled={saving}>Registrar práctica</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de práctica">
            <Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Ej: Aplicación de compost" />
          </Field>
          <Field label="Fecha de aplicación">
            <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>
        </div>
        <Field label="Descripción" className="mt-[14px]">
          <Textarea
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Describe la práctica aplicada…"
          />
        </Field>
        <div className="mt-[14px] grid grid-cols-3 gap-4">
          <Field label="Insumo">
            <Input value={form.insumo} onChange={(e) => setForm({ ...form, insumo: e.target.value })} placeholder="Ej: Humus" />
          </Field>
          <Field label="Cantidad">
            <Input type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Unidad">
            <Input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="kg" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ============ Sección: Costos ============ */
function SeccionCostos({ cultivoId }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    categoria: "Insumos",
    descripcion: "",
    cantidad: "",
    unidad: "",
    monto: "",
    fecha: new Date().toISOString().slice(0, 10),
  });

  const load = () => {
    setRows(null);
    trazabilidadApi
      .costos(cultivoId)
      .then(setRows)
      .catch(() => {
        toast("No se pudieron cargar los costos", "danger");
        setRows([]);
      });
  };
  useEffect(load, [cultivoId]);

  const total = (rows || []).reduce((s, c) => s + Number(c.monto || 0), 0);
  const moneda = (rows || [])[0]?.moneda || "PEN";

  const openNew = () => {
    setForm({
      categoria: "Insumos",
      descripcion: "",
      cantidad: "",
      unidad: "",
      monto: "",
      fecha: new Date().toISOString().slice(0, 10),
    });
    setModal(true);
  };
  const save = () => {
    const monto = parseFloat(form.monto) || 0;
    if (!form.descripcion.trim() || !monto) {
      toast("Completa descripción y monto", "danger");
      return;
    }
    setSaving(true);
    trazabilidadApi
      .crearCosto({
        cultivo_id: cultivoId,
        categoria: form.categoria,
        descripcion: form.descripcion.trim(),
        cantidad: form.cantidad === "" ? null : +form.cantidad,
        unidad: form.unidad.trim() || null,
        monto,
        moneda: "PEN",
        fecha: form.fecha,
      })
      .then(() => {
        toast("Gasto registrado");
        setModal(false);
        load();
      })
      .catch(() => toast("No se pudo registrar el gasto", "danger"))
      .finally(() => setSaving(false));
  };

  const cols = "0.7fr 0.95fr 1.7fr 0.7fr 0.7fr 0.75fr";

  return (
    <div>
      <SectionHead
        title="Costos"
        subtitle="Control de gastos de insumos, agua y mano de obra"
        action={<Button icon="plus" onClick={openNew}>Registrar gasto</Button>}
      />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState icon="coins" title="Sin gastos registrados" desc="Registra el primer costo del cultivo." />
      ) : (
        <>
          <div className="mb-[14px] text-[13px] font-extrabold uppercase tracking-[.05em] text-muted-2">
            Registro de gastos
          </div>
          <Card pad="p-0" className="overflow-hidden">
            <Table head={["Fecha", "Categoría", "Descripción", "Cantidad", "Unidad", "Costo"]} cols={cols}>
              {rows.map((c) => {
                const cat = COSTO_CAT[c.categoria] || COSTO_CAT.Insumos;
                return (
                  <Row key={c.id} cols={cols}>
                    <Cell>
                      <span className="font-mono text-[13px] font-bold text-text">{fmtFecha(c.fecha)}</span>
                    </Cell>
                    <Cell>
                      <Badge bg={cat.bg} fg={cat.fg} dot={cat.dot}>{c.categoria}</Badge>
                    </Cell>
                    <Cell>
                      <span className="text-[14px] text-muted-1">{c.descripcion}</span>
                    </Cell>
                    <Cell>
                      <span className="text-[13.5px] text-muted-1">{c.cantidad != null ? Number(c.cantidad) : "Sin cantidad"}</span>
                    </Cell>
                    <Cell>
                      <span className="text-[13.5px] text-muted-2">{c.unidad || "Sin unidad"}</span>
                    </Cell>
                    <Cell>
                      <span className="text-[14.5px] font-extrabold text-terracotta">
                        {fmtMoneda(c.monto, c.moneda)}
                      </span>
                    </Cell>
                  </Row>
                );
              })}
            </Table>
            <div
              className="grid items-center gap-4 bg-accent-50 px-[26px] py-4"
              style={{ gridTemplateColumns: cols }}
            >
              <span className="text-muted-3">—</span>
              <span className="text-muted-3">—</span>
              <span className="text-[14.5px] font-extrabold text-text">Total acumulado</span>
              <span className="text-muted-3">—</span>
              <span className="text-muted-3">—</span>
              <span className="text-[16px] font-extrabold text-primary">{fmtMoneda(total, moneda)}</span>
            </div>
          </Card>
        </>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Registrar gasto"
        subtitle="Añade un costo al registro del cultivo"
        width={580}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button icon="check" onClick={save} disabled={saving}>Registrar gasto</Button>
          </>
        }
      >
        <Field label="Categoría de costo">
          <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            <option>Insumos</option>
            <option>Mano de obra</option>
            <option>Agua</option>
          </Select>
        </Field>
        <Field label="Descripción" className="mt-[14px]">
          <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Semillas certificadas" />
        </Field>
        <div className="mt-[14px] grid grid-cols-3 gap-[14px]">
          <Field label="Cantidad">
            <Input type="number" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Unidad">
            <Input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="sacos" />
          </Field>
          <Field label="Costo (S/)">
            <Input type="number" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="0.00" />
          </Field>
        </div>
        <Field label="Fecha" className="mt-[14px]">
          <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
        </Field>
      </Modal>
    </div>
  );
}

/* ============ Sección: Cuidados ============ */
function SeccionCuidados({ cultivoId }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [marcando, setMarcando] = useState(null);
  const blankForm = { tipo: TIPOS_CUIDADO[0].value, descripcion: "", frecuencia_dias: "2" };
  const [form, setForm] = useState(blankForm);

  const load = () => {
    setRows(null);
    cuidadosApi
      .list(cultivoId)
      .then(setRows)
      .catch(() => {
        toast("No se pudieron cargar los cuidados", "danger");
        setRows([]);
      });
  };
  useEffect(load, [cultivoId]);

  const openNew = () => {
    setEditing(null);
    setForm(blankForm);
    setModal(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ tipo: c.tipo, descripcion: c.descripcion || "", frecuencia_dias: String(c.frecuencia_dias) });
    setModal(true);
  };

  const save = () => {
    const frecuencia = parseInt(form.frecuencia_dias, 10);
    if (!frecuencia || frecuencia <= 0) {
      toast("Ingresa una frecuencia válida en días", "danger");
      return;
    }
    setSaving(true);
    const payload = {
      tipo: form.tipo,
      descripcion: form.descripcion.trim() || null,
      frecuencia_dias: frecuencia,
    };
    const req = editing
      ? cuidadosApi.update(editing.id, payload)
      : cuidadosApi.create({ cultivo_id: cultivoId, ...payload });
    req
      .then(() => {
        toast(editing ? "Cuidado actualizado" : "Cuidado registrado");
        setModal(false);
        load();
      })
      .catch(() => toast("No se pudo guardar el cuidado", "danger"))
      .finally(() => setSaving(false));
  };

  const marcarRealizado = (c) => {
    setMarcando(c.id);
    cuidadosApi
      .marcarRealizado(c.id)
      .then((actualizado) => {
        setRows((prev) => prev.map((r) => (r.id === c.id ? actualizado : r)));
        toast("Cuidado marcado como realizado");
      })
      .catch(() => toast("No se pudo actualizar el cuidado", "danger"))
      .finally(() => setMarcando(null));
  };

  const toggleActivo = (c) => {
    cuidadosApi
      .update(c.id, { activo: !c.activo })
      .then((actualizado) => setRows((prev) => prev.map((r) => (r.id === c.id ? actualizado : r))))
      .catch(() => toast("No se pudo actualizar el cuidado", "danger"));
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    cuidadosApi
      .remove(toDelete.id)
      .then(() => {
        toast("Cuidado eliminado");
        setToDelete(null);
        load();
      })
      .catch(() => toast("No se pudo eliminar el cuidado", "danger"));
  };

  return (
    <div>
      <SectionHead
        title="Cuidados"
        subtitle="Tareas periódicas de riego, abono y mantenimiento del cultivo"
        action={<Button icon="plus" onClick={openNew}>Nuevo cuidado</Button>}
      />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="drop"
          title="Sin cuidados registrados"
          desc="Registra tareas periódicas como 'Regar cada 2 días' o 'Abonar cada 30 días' para generar alertas automáticas."
          action={<Button icon="plus" onClick={openNew}>Nuevo cuidado</Button>}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-[18px]">
          {rows.map((c) => {
            const meta = TIPOS_CUIDADO.find((t) => t.value === c.tipo) || TIPOS_CUIDADO[TIPOS_CUIDADO.length - 1];
            return (
              <Card key={c.id} pad="p-5" className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px] bg-accent-50 text-primary"
                    >
                      <Icon name={meta.icon} size={20} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[15.5px] font-extrabold leading-[1.2] text-text">{c.tipo}</div>
                      <div className="mt-[2px] text-[12.5px] font-semibold text-muted-2">
                        Cada {c.frecuencia_dias} día{c.frecuencia_dias === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <Toggle on={c.activo} onClick={() => toggleActivo(c)} title={c.activo ? "Activo" : "Pausado"} />
                </div>

                {c.descripcion && (
                  <p className="m-0 text-[13.5px] leading-[1.5] text-muted-1 [text-wrap:pretty]">{c.descripcion}</p>
                )}

                <div className="text-[13px] text-muted-2">
                  <span className="font-bold text-muted-1">Última vez: </span>
                  {c.ultima_realizada ? fechaHora(c.ultima_realizada) : "Nunca registrado"}
                </div>

                <div className="flex items-center justify-between gap-2">
                  {c.vencido ? (
                    <Badge bg="#fbe1de" fg="#b23a2e" dot="#d6584a">Pendiente hoy</Badge>
                  ) : (
                    <span className="font-mono text-[12.5px] text-muted-3">
                      Próximo: {fmtFecha(c.proxima_fecha)}
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <IconBtn name="edit" title="Editar" onClick={() => openEdit(c)} />
                    <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => setToDelete(c)} />
                  </div>
                </div>

                <Button
                  variant={c.vencido ? "primary" : "ghost"}
                  icon="check"
                  size="sm"
                  onClick={() => marcarRealizado(c)}
                  disabled={marcando === c.id}
                >
                  {marcando === c.id ? "Guardando…" : "Marcar como realizado"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? "Editar cuidado" : "Nuevo cuidado"}
        subtitle="Define una tarea periódica para este cultivo"
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
            <Button icon="check" onClick={save} disabled={saving}>
              {editing ? "Guardar cambios" : "Registrar cuidado"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de cuidado">
            <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS_CUIDADO.map((t) => (
                <option key={t.value} value={t.value}>{t.value}</option>
              ))}
            </Select>
          </Field>
          <Field label="Frecuencia (días)">
            <Input
              type="number"
              min="1"
              value={form.frecuencia_dias}
              onChange={(e) => setForm({ ...form, frecuencia_dias: e.target.value })}
              placeholder="Ej: 2"
            />
          </Field>
        </div>
        <Field label="Descripción (opcional)" className="mt-[14px]">
          <Textarea
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Ej: Regar el cultivo en horas de la mañana"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        question="¿Eliminar este cuidado?"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </div>
  );
}

/* ============ Workspace ============ */
export default function CultivoWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [cultivo, setCultivo] = useState(null);
  const [error, setError] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get("section");
  const defaultSection = CULTIVO_SECTIONS[0].id;
  const section = CULTIVO_SECTIONS.some((s) => s.id === sectionParam) ? sectionParam : defaultSection;
  const setSection = (id) => setSearchParams(id === defaultSection ? {} : { section: id });

  useEffect(() => {
    setCultivo(null);
    setError(false);
    cultivosApi
      .get(id)
      .then(setCultivo)
      .catch(() => {
        setError(true);
        toast("No se pudo cargar el cultivo", "danger");
      });
  }, [id]);

  if (error) {
    return (
      <div className="animate-fade">
        <button
          onClick={() => navigate("/cultivos")}
          className="mb-[18px] inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-[14.5px] font-bold text-muted-1 transition-colors hover:bg-chip hover:text-primary"
        >
          <Icon name="arrowLeft" size={18} />
          Volver a Gestión de Cultivos
        </button>
        <EmptyState icon="info" title="No se pudo cargar el cultivo" desc="Vuelve a intentarlo o regresa a la lista de cultivos." />
      </div>
    );
  }

  if (!cultivo) {
    return (
      <div className="animate-fade">
        <Loading />
      </div>
    );
  }

  const tint = tintFor(cultivo.especie);

  return (
    <div className="animate-fade">
      {/* Volver */}
      <button
        onClick={() => navigate("/cultivos")}
        className="mb-[18px] inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-[14.5px] font-bold text-muted-1 transition-colors hover:bg-chip hover:text-primary"
      >
        <Icon name="arrowLeft" size={18} />
        Volver a Gestión de Cultivos
      </button>

      {/* Cabecera del cultivo */}
      <div className="mb-[22px] flex flex-wrap items-center gap-4">
        <span
          className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-[15px] text-white"
          style={{ background: tintGradient(tint) }}
        >
          <Icon name="leaf" size={28} />
        </span>
        <div className="min-w-0">
          <h1 className="m-0 text-[27px] font-extrabold leading-[1.1] tracking-[-.01em] text-text">
            {cultivo.especie}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-[14px] gap-y-2 text-[13.5px] font-semibold text-muted-1">
            {cultivo.variedad && <span>{cultivo.variedad}</span>}
            {cultivo.biohuerto_nombre && (
              <span className="inline-flex items-center gap-[5px]">
                <Icon name="pin" size={15} />
                {cultivo.biohuerto_nombre}
              </span>
            )}
            <EtapaBadge etapa={cultivo.etapa} />
          </div>
        </div>
      </div>

      {/* Pestañas de sección */}
      <div className="mb-[26px] flex flex-wrap gap-[6px] border-b border-line pb-[2px]">
        {CULTIVO_SECTIONS.map((s) => {
          const a = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`relative inline-flex items-center gap-2 px-[14px] py-[11px] text-[14.5px] transition-colors ${
                a ? "font-extrabold text-primary" : "font-semibold text-muted-2 hover:text-text"
              }`}
            >
              <Icon name={s.icon} size={18} stroke={1.9} />
              {s.label}
              {a && (
                <span className="absolute inset-x-[10px] -bottom-[3px] h-[3px] rounded-t-[3px] bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      {section === "monitoreo" && <SeccionMonitoreo cultivoId={id} />}
      {section === "diagnostico" && <SeccionDiagnostico cultivoId={id} cultivo={cultivo} />}
      {section === "incidencias" && <SeccionIncidencias cultivoId={id} />}
      {section === "recomendaciones" && <SeccionRecomendaciones cultivoId={id} cultivo={cultivo} />}
      {section === "practicas" && <SeccionPracticas cultivoId={id} />}
      {section === "costos" && <SeccionCostos cultivoId={id} />}
      {section === "cuidados" && <SeccionCuidados cultivoId={id} />}
    </div>
  );
}
