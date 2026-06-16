import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PageHeader,
  Card,
  Button,
  IconBtn,
  Icon,
  Field,
  Input,
  Textarea,
  Select,
  SearchInput,
  Modal,
  EmptyState,
  EstadoBadge,
  Photo,
  ImageUpload,
  Toggle,
} from "../components/ui/primitives.jsx";
import { tintFor } from "../lib/theme.js";
import { biohuertosApi, catalogosApi, cultivosApi, usuariosApi } from "../lib/resources.js";
import { useAuth } from "../context/AuthContext.jsx";
import BiohuertoGrid, { celdasLabel, normalizeCeldas } from "../components/biohuerto/BiohuertoGrid.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import AddressPicker from "../components/ui/AddressPicker.jsx";
import {
  useConfirm,
  useNotify,
  eliminarDialog,
  bajaDialog,
  reactivarDialog,
  referenciadoDialog,
} from "../components/ui/Confirm.jsx";

// ---- View mode toggle (Tarjetas / Lista) ----
function ViewToggle({ view, onChange }) {
  const opts = [
    { id: "cards", icon: "grid", title: "Tarjetas" },
    { id: "list", icon: "list", title: "Lista" },
    { id: "map", icon: "seedling", title: "Mapa" },
  ];
  return (
    <div
      className="inline-flex h-12 items-center gap-1 rounded-[11px] bg-chip p-1"
      style={{ display: "inline-flex" }}
    >
      {opts.map((o) => (
        <button
          key={o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
          className="grid h-[38px] w-[38px] place-items-center rounded-lg border-none transition-all"
          style={{
            background: view === o.id ? "#fff" : "transparent",
            color: view === o.id ? "var(--primary)" : "var(--muted-2)",
            boxShadow: view === o.id ? "0 1px 3px rgba(20,40,30,.12)" : "none",
            cursor: "pointer",
          }}
        >
          <Icon name={o.icon} size={19} />
        </button>
      ))}
    </div>
  );
}

// ---- Card cell ----
function BiohuertoCard({ b, actions }) {
  const dim = !b.is_active;
  const tint = tintFor(b.nombre);
  return (
    <Card pad="" hover className="overflow-hidden" >
      <div style={{ opacity: dim ? 0.62 : 1 }}>
        <Photo
          tint={dim ? "default" : tint}
          height={188}
          src={b.imagen}
          label={`foto: ${(b.nombre || "").toLowerCase()}`}
          badge={
            <>
              <span className="absolute right-[14px] top-[14px] rounded-[9px] bg-primary px-3 py-[5px] text-[13px] font-extrabold text-white">
                {b.codigo}
              </span>
              <span
                className={`absolute left-[14px] top-[14px] flex items-center gap-1 rounded-[9px] px-[10px] py-[5px] text-[12px] font-extrabold text-white ${
                  b.es_publico ? "bg-sky-500" : "bg-slate-500"
                }`}
              >
                <Icon name={b.es_publico ? "globe" : "lock"} size={12} />
                {b.es_publico ? "Publico" : "Privado"}
              </span>
              {dim && (
                <span className="absolute left-[14px] top-[38px]">
                  <EstadoBadge activo={false} />
                </span>
              )}
            </>
          }
        />
        <div className="p-[22px]">
          <div className="flex items-start justify-between gap-[14px]">
            <div className="flex min-w-0 flex-col gap-[6px]">
              <h3 className="m-0 text-[21px] font-extrabold text-primary">{b.nombre}</h3>
              <div className="flex items-center gap-[6px] text-sm text-muted-2">
                <Icon name="pin" size={16} />
                {b.ubicacion_referencia || "Sin ubicación"}
              </div>
            </div>
            <div
              className="flex-shrink-0 rounded-xl px-[14px] py-2 text-center"
              style={{ background: "var(--accent-50)" }}
            >
              <div className="text-[22px] font-extrabold leading-none text-primary">
                {b.cultivos_count ?? 0}
              </div>
              <div
                className="mt-[3px] text-[10.5px] font-extrabold tracking-[.08em]"
                style={{ color: "var(--accent-700)" }}
              >
                CULTIVOS
              </div>
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-[18px]">
            <div className="text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted-2">
              Área disponible
            </div>
            <div className="mt-1 text-[22px] font-extrabold text-terracotta">
              {b.area_m2} m²
            </div>
          </div>

          <div className="mt-5 flex items-center gap-[10px]">
            <Button variant="ghost" icon="eye" size="sm" full onClick={() => actions.view(b)}>
              Detalles
            </Button>
            <IconBtn
              name="edit"
              title={b.is_active ? "Modificar" : "Reactiva el biohuerto para editarlo"}
              disabled={!b.is_active}
              onClick={() => actions.edit(b)}
            />
            <Toggle
              on={b.is_active}
              title={b.is_active ? "Dar de baja" : "Reactivar"}
              onClick={() => actions.toggle(b)}
            />
            <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => actions.eliminar(b)} />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---- List view ----
function BiohuertoList({ rows, actions }) {
  return (
    <Card pad="" className="overflow-hidden">
      <div
        className="grid items-center gap-3 border-b border-line bg-chip-2 px-[22px] py-[14px] text-[12.5px] font-extrabold uppercase tracking-[.05em] text-muted-2"
        style={{ gridTemplateColumns: "1.5fr 1.4fr .8fr .9fr .5fr .5fr 1fr" }}
      >
        <div>Biohuerto</div>
        <div>Ubicación de referencia</div>
        <div>Área disp.</div>
        <div>Cultivos activos</div>
        <div>Acceso</div>
        <div>Estado</div>
        <div className="text-right">Acciones</div>
      </div>
      {rows.map((b) => {
        const dim = !b.is_active;
        return (
          <div
            key={b.id}
            className="grid items-center gap-3 border-b border-line px-[22px] py-[15px] last:border-b-0"
            style={{ gridTemplateColumns: "1.5fr 1.4fr .8fr .9fr .5fr .5fr 1fr" }}
          >
            <div className="flex min-w-0 items-center gap-[13px]">
              <div className="flex min-w-0 flex-col gap-[3px]">
                <div
                  className="overflow-hidden text-ellipsis whitespace-nowrap text-[15.5px] font-extrabold leading-tight"
                  style={{ color: dim ? "var(--muted-2)" : "var(--text)" }}
                >
                  {b.nombre}
                </div>
                <div className="font-mono text-[12.5px] font-bold text-muted-2">{b.codigo}</div>
              </div>
            </div>
            <div
              className="inline-flex items-center gap-[7px] text-sm"
              style={{ color: dim ? "var(--muted-3)" : "var(--muted-1)" }}
            >
              <Icon name="pin" size={16} />
              {b.ubicacion_referencia || "Sin ubicación"}
            </div>
            <div
              className="whitespace-nowrap text-[15px] font-extrabold"
              style={{ color: dim ? "var(--muted-3)" : "var(--terracotta)" }}
            >
              {b.area_m2} m²
            </div>
            <div>
              <span
                className="grid h-[26px] min-w-[30px] place-items-center rounded-lg px-[9px] text-[14px] font-extrabold text-primary"
                style={{ background: "var(--accent-50)", display: "inline-grid" }}
              >
                {b.cultivos_count ?? 0}
              </span>
            </div>
            <div>
              <span
                className={`inline-flex items-center gap-1 rounded-lg px-[9px] py-[4px] text-[12px] font-extrabold ${
                  b.es_publico
                    ? "bg-sky-50 text-sky-600"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <Icon name={b.es_publico ? "globe" : "lock"} size={11} />
                {b.es_publico ? "Publico" : "Privado"}
              </span>
            </div>
            <div>
              <EstadoBadge activo={b.is_active} />
            </div>
            <div className="flex items-center justify-end gap-[6px]">
              <IconBtn name="eye" title="Ver detalle" onClick={() => actions.view(b)} />
              <IconBtn
                name="edit"
                title={dim ? "Reactiva el biohuerto para editarlo" : "Modificar"}
                disabled={dim}
                onClick={() => actions.edit(b)}
              />
              <Toggle
                on={b.is_active}
                title={b.is_active ? "Dar de baja" : "Reactivar"}
                onClick={() => actions.toggle(b)}
              />
              <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => actions.eliminar(b)} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function BiohuertoMapCard({ b, cultivos, onFreeCell, onBusyCell, onGridChange }) {
  const confirm = useConfirm();
  const [gridFilas, setGridFilas] = useState(Number(b.grid_filas) || 4);
  const [gridColumnas, setGridColumnas] = useState(Number(b.grid_columnas) || 4);

  // Sync if the parent biohuerto object changes (e.g. after other saves)
  useEffect(() => {
    setGridFilas(Number(b.grid_filas) || 4);
    setGridColumnas(Number(b.grid_columnas) || 4);
  }, [b.id, b.grid_filas, b.grid_columnas]);

  const areaCelda = Number(b.area_m2 || 0) / Math.max(gridFilas * gridColumnas, 1);

  const stepGrid = async (key, delta) => {
    const current = key === "grid_filas" ? gridFilas : gridColumnas;
    const next = Math.min(30, Math.max(1, current + delta));
    if (next === current) return;
    if (next < current) {
      const biohuertoCultivos = cultivos.filter(
        (c) => String(c.biohuerto_id) === String(b.id) && c.is_active !== false
      );
      const affected = biohuertoCultivos.filter((c) => {
        const celdas = normalizeCeldas(c);
        if (key === "grid_filas") return celdas.some((celda) => celda.fila > next);
        return celdas.some((celda) => celda.columna > next);
      });
      if (affected.length > 0) {
        const label = key === "grid_filas" ? "fila" : "columna";
        const nombres = [...new Set(affected.map((c) => c.especie || "Cultivo"))].join(", ");
        const ok = await confirm({
          tone: "warning",
          question: `¿Quitar esta ${label} del mapa?`,
          message: `Los cultivos "${nombres}" tienen celdas en la ${label} que se eliminaría. Si confirmas, esas celdas quedarán fuera de los límites del mapa. ¿Deseas continuar?`,
          confirmLabel: "Sí, continuar",
        });
        if (!ok) return;
      }
    }
    // Update local state immediately so the grid re-renders without waiting the API
    if (key === "grid_filas") setGridFilas(next);
    else setGridColumnas(next);
    // Persist in background
    onGridChange(b, { [key]: next });
  };

  // Patch biohuerto with local values so BiohuertoGrid reflects the change instantly
  const biohuertoPatch = { ...b, grid_filas: gridFilas, grid_columnas: gridColumnas };

  return (
    <Card pad="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[21px] font-extrabold text-primary">{b.nombre}</h3>
          <p className="mt-1 text-sm font-semibold text-muted-2">
            {gridFilas} filas × {gridColumnas} columnas · {areaCelda.toFixed(2)} m² aprox. por celda
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-[6px]">
            <div className="flex items-center gap-[6px]">
              <span className="w-[64px] text-[11px] font-extrabold uppercase tracking-[.05em] text-muted-2">
                Filas
              </span>
              <IconBtn name="minus" title="Quitar fila" onClick={() => stepGrid("grid_filas", -1)} />
              <span className="w-7 text-center font-mono text-[14px] font-extrabold text-text">
                {gridFilas}
              </span>
              <IconBtn name="plus" title="Agregar fila" onClick={() => stepGrid("grid_filas", 1)} />
            </div>
            <div className="flex items-center gap-[6px]">
              <span className="w-[64px] text-[11px] font-extrabold uppercase tracking-[.05em] text-muted-2">
                Columnas
              </span>
              <IconBtn name="minus" title="Quitar columna" onClick={() => stepGrid("grid_columnas", -1)} />
              <span className="w-7 text-center font-mono text-[14px] font-extrabold text-text">
                {gridColumnas}
              </span>
              <IconBtn name="plus" title="Agregar columna" onClick={() => stepGrid("grid_columnas", 1)} />
            </div>
          </div>
          <span className="rounded-lg bg-chip px-3 py-2 font-mono text-[12.5px] font-bold text-muted-1">
            {b.codigo}
          </span>
        </div>
      </div>
      <BiohuertoGrid
        biohuerto={biohuertoPatch}
        cultivos={cultivos.filter((c) => String(c.biohuerto_id) === String(b.id))}
        selected={[]}
        onOccupiedClick={onBusyCell}
        onToggle={(celda) => onFreeCell(b, [celda])}
      />
    </Card>
  );
}

function BiohuertoMapView({ biohuertos, cultivos, onFreeCell, onBusyCell, onGridChange }) {
  return (
    <div className="grid gap-6">
      {biohuertos.map((b) => (
        <BiohuertoMapCard
          key={b.id}
          b={b}
          cultivos={cultivos}
          onFreeCell={onFreeCell}
          onBusyCell={onBusyCell}
          onGridChange={onGridChange}
        />
      ))}
    </div>
  );
}

function SiembraCeldaModal({ open, data, cultivos, onClose, onSaved }) {
  const toast = useToast();
  const [especies, setEspecies] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selectedCeldas, setSelectedCeldas] = useState([]);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    especie_id: "",
    variedad: "",
    etapa: "semillero",
    fecha_siembra: today,
    fecha_estimada_cosecha: "",
    cantidad: "",
    unidad_id: "",
    area_m2: "",
    notas: "",
  });

  useEffect(() => {
    if (!open) return;
    setSelectedCeldas(data?.celdas || []);
    setForm((f) => ({
      ...f,
      especie_id: "",
      variedad: "",
      etapa: "semillero",
      fecha_siembra: today,
      fecha_estimada_cosecha: "",
      cantidad: "",
      unidad_id: "",
      area_m2: "",
      notas: "",
    }));
    catalogosApi.list("especies").then((d) => setEspecies(Array.isArray(d) ? d : d?.items || [])).catch(() => setEspecies([]));
    catalogosApi.list("unidades").then((d) => setUnidades(Array.isArray(d) ? d : d?.items || [])).catch(() => setUnidades([]));
    catalogosApi.list("etapas").then((d) => setEtapas(Array.isArray(d) ? d : d?.items || [])).catch(() => setEtapas([]));
  }, [data, open, today]);

  useEffect(() => {
    if (!open || !data?.biohuerto) return;
    const filas = Number(data.biohuerto.grid_filas) || 4;
    const columnas = Number(data.biohuerto.grid_columnas) || 4;
    const area = (Number(data.biohuerto.area_m2 || 0) / Math.max(filas * columnas, 1)) * Math.max(selectedCeldas.length, 1);
    setForm((f) => ({ ...f, area_m2: area ? area.toFixed(2) : "" }));
  }, [data, open, selectedCeldas.length]);

  if (!open || !data) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.especie_id || !form.fecha_siembra || selectedCeldas.length === 0) {
      toast("Selecciona especie, fecha y al menos una celda", "danger");
      return;
    }
    setSaving(true);
    try {
      await cultivosApi.create({
        biohuerto_id: data.biohuerto.id,
        especie_id: Number(form.especie_id),
        variedad: form.variedad || null,
        etapa: form.etapa || "semillero",
        fecha_siembra: form.fecha_siembra,
        fecha_estimada_cosecha: form.fecha_estimada_cosecha || null,
        cantidad: form.cantidad === "" ? null : Number(form.cantidad),
        unidad_id: form.unidad_id === "" ? null : Number(form.unidad_id),
        area_m2: form.area_m2 === "" ? null : Number(form.area_m2),
        celda_fila: selectedCeldas[0].fila,
        celda_columna: selectedCeldas[0].columna,
        celdas: selectedCeldas,
        notas: form.notas || null,
      });
      toast("Cultivo sembrado en la celda");
      onSaved();
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo registrar el cultivo", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={760}
      title="Sembrar cultivo"
      subtitle={`${data.biohuerto.nombre} - ${celdasLabel(selectedCeldas)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button icon="check" onClick={submit} disabled={saving}>{saving ? "Guardando..." : "Sembrar"}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Celdas del cultivo" hint="Puedes seleccionar una o varias celdas libres. Las ocupadas aparecen con brote.">
          <BiohuertoGrid
            biohuerto={data.biohuerto}
            cultivos={cultivos.filter((c) => String(c.biohuerto_id) === String(data.biohuerto.id))}
            selected={selectedCeldas}
            onToggle={(celda) =>
              setSelectedCeldas((items) => {
                const exists = items.some((x) => x.fila === celda.fila && x.columna === celda.columna);
                return exists
                  ? items.filter((x) => x.fila !== celda.fila || x.columna !== celda.columna)
                  : [...items, celda];
              })
            }
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Especie">
            <Select value={form.especie_id} onChange={set("especie_id")}>
              <option value="">Selecciona...</option>
              {especies.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Variedad">
            <Input value={form.variedad} onChange={set("variedad")} placeholder="Opcional" />
          </Field>
          <Field label="Etapa">
            <Select value={form.etapa} onChange={set("etapa")}>
              {etapas.map((e) => <option key={e.id} value={e.codigo}>{e.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Unidad">
            <Select value={form.unidad_id} onChange={set("unidad_id")}>
              <option value="">Por defecto</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </Select>
          </Field>
          <Field label="Fecha de siembra">
            <Input type="date" value={form.fecha_siembra} onChange={set("fecha_siembra")} />
          </Field>
          <Field label="Cosecha estimada">
            <Input type="date" value={form.fecha_estimada_cosecha} onChange={set("fecha_estimada_cosecha")} />
          </Field>
          <Field label="Cantidad">
            <Input type="number" value={form.cantidad} onChange={set("cantidad")} placeholder="0" />
          </Field>
          <Field label="Area sembrada (m²)">
            <Input type="number" value={form.area_m2} onChange={set("area_m2")} placeholder="0" />
          </Field>
        </div>
        <Field label="Notas">
          <Textarea value={form.notas} onChange={set("notas")} placeholder="Observaciones de siembra" />
        </Field>
      </div>
    </Modal>
  );
}

function CultivoCeldaDetalle({ cultivo, onClose, onOpenCultivos }) {
  if (!cultivo) return null;
  return (
    <Modal
      open={!!cultivo}
      onClose={onClose}
      title={cultivo.especie}
      subtitle={celdasLabel(normalizeCeldas(cultivo))}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button icon="leaf" onClick={onOpenCultivos}>Ir a cultivos</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Biohuerto" value={cultivo.biohuerto_nombre || "Sin biohuerto"} />
        <Stat label="Etapa" value={cultivo.etapa_nombre || cultivo.etapa} />
        <Stat label="Variedad" value={cultivo.variedad || "Sin variedad"} />
        <Stat label="Area" value={cultivo.area_m2 != null ? `${cultivo.area_m2} m²` : "Sin area"} />
        <Stat label="Cantidad" value={cultivo.cantidad != null ? `${cultivo.cantidad} ${cultivo.unidad || "und"}` : "Sin cantidad"} />
        <Stat label="Cosecha estimada" value={cultivo.fecha_estimada_cosecha || "Sin fecha"} />
      </div>
    </Modal>
  );
}

// ---- Stat box (view modal) ----
function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-[14px]">
      <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted-2">
        {label}
      </div>
      <div className="mt-[5px] text-[18px] font-extrabold text-text">{value}</div>
    </div>
  );
}

// ---- Create / View modal ----
const ESTADO_OPCIONES = [
  { value: "nuevo", label: "Nuevo" },
  { value: "sembrado", label: "Sembrado" },
  { value: "en_tratamiento", label: "En tratamiento" },
  { value: "activo", label: "Activo" },
  { value: "en_descanso", label: "En descanso" },
  { value: "inactivo", label: "Inactivo" },
];
const estadoLabel = (v) =>
  ESTADO_OPCIONES.find((o) => o.value === v)?.label || v || "—";

// Abreviatura a partir del nombre (iniciales de palabras significativas).
const _STOP_ABBR = new Set(["de", "del", "la", "las", "los", "el", "y", "en", "biohuerto", "huerto"]);
function abbrevFromName(nombre) {
  const norm = (nombre || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  let words = (norm.match(/[A-Za-z0-9]+/g) || []).filter((w) => !_STOP_ABBR.has(w.toLowerCase()));
  if (!words.length) words = norm.match(/[A-Za-z0-9]+/g) || [];
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 4).map((w) => w[0]).join("").toUpperCase();
}

const EMPTY_FORM = {
  nombre: "",
  codigo: "",
  abreviatura: "",
  ubicacion_referencia: "",
  area_m2: "",
  tipo_area_id: "",
  estado: "nuevo",
  grid_filas: 4,
  grid_columnas: 4,
  es_publico: false,
  latitud: "",
  longitud: "",
  descripcion: "",
  imagen: "",
};

// Encabezado de paso numerado para guiar el registro.
function Step({ n, title, hint }) {
  return (
    <div className="flex items-center gap-[10px]">
      <span className="grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full bg-primary text-[13px] font-extrabold text-white">
        {n}
      </span>
      <span className="text-[15.5px] font-extrabold text-text">{title}</span>
      {hint && <span className="text-[12.5px] text-muted-2">· {hint}</span>}
    </div>
  );
}

function AsignacionProductores({ biohuerto }) {
  const toast = useToast();
  const [productores, setProductores] = useState([]);
  const [asignados, setAsignados] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAsignacion = async () => {
    if (!biohuerto?.id) return;
    setLoading(true);
    try {
      const [prodData, ownerData] = await Promise.all([
        usuariosApi.list({ rol: "productor", is_active: true }),
        biohuertosApi.propietarios(biohuerto.id),
      ]);
      setProductores(Array.isArray(prodData) ? prodData : prodData?.items || []);
      setAsignados(Array.isArray(ownerData) ? ownerData : ownerData?.items || []);
      setChecked(new Set());
    } catch {
      toast("No se pudo cargar la asignacion de productores", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAsignacion();
  }, [biohuerto?.id]);

  const disponibles = productores.filter(
    (p) => !asignados.some((a) => Number(a.propietario_id) === Number(p.id))
  );

  const toggle = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setChecked(checked.size === disponibles.length ? new Set() : new Set(disponibles.map((p) => p.id)));

  const asignarSeleccionados = async () => {
    if (checked.size === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        [...checked].map((id) =>
          biohuertosApi.assignPropietario(biohuerto.id, { propietario_id: Number(id), rol: "propietario" })
        )
      );
      toast(`${checked.size} productor(es) asignado(s) al biohuerto`);
      await loadAsignacion();
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo asignar", "danger");
    } finally {
      setSaving(false);
    }
  };

  const quitar = async (propietario) => {
    setSaving(true);
    try {
      await biohuertosApi.removePropietario(biohuerto.id, propietario.propietario_id);
      toast("Productor retirado del biohuerto");
      await loadAsignacion();
    } catch {
      toast("No se pudo retirar el productor", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-white px-4 py-[14px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted-2">
            Productores asignados
          </div>
          <div className="mt-[3px] text-sm font-semibold text-muted-1">
            Controla que productores pueden ver y sembrar este biohuerto.
          </div>
        </div>
        {loading && <span className="text-xs font-bold text-muted-2">Cargando…</span>}
      </div>

      {/* Lista con checkboxes para asignar varios a la vez */}
      {disponibles.length > 0 && (
        <div className="mb-4">
          <div className="mb-[6px] flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-[.05em] text-muted-2">
              Agregar productores
            </span>
            <button
              type="button"
              className="text-[11.5px] font-bold text-primary hover:underline"
              onClick={toggleAll}
            >
              {checked.size === disponibles.length ? "Deseleccionar todos" : "Seleccionar todos"}
            </button>
          </div>
          <div className="max-h-[160px] overflow-y-auto rounded-xl border border-line">
            {disponibles.map((p, i) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 px-3 py-[9px] hover:bg-chip ${
                  i < disponibles.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 rounded accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-extrabold text-text">{p.nombre}</div>
                  <div className="truncate text-[12px] font-semibold text-muted-2">{p.email}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-muted-2">
              {checked.size > 0 ? `${checked.size} seleccionado(s)` : "Selecciona uno o varios"}
            </span>
            <Button
              size="sm"
              icon="plus"
              onClick={asignarSeleccionados}
              disabled={checked.size === 0 || saving}
            >
              {saving ? "Asignando…" : `Asignar${checked.size > 0 ? ` (${checked.size})` : ""}`}
            </Button>
          </div>
        </div>
      )}

      {/* Productores ya asignados */}
      <div className="text-[11px] mb-[6px] font-extrabold uppercase tracking-[.05em] text-muted-2">
        Con acceso ({asignados.length})
      </div>
      {asignados.length === 0 ? (
        <div className="rounded-lg bg-chip px-3 py-2 text-sm font-semibold text-muted-2">
          Ningun productor asignado aun.
        </div>
      ) : (
        <div className="grid gap-2">
          {asignados.map((p) => (
            <div
              key={p.propietario_id}
              className="flex items-center justify-between gap-3 rounded-lg bg-chip px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-text">{p.nombre}</div>
                <div className="truncate text-xs font-semibold text-muted-2">{p.email}</div>
              </div>
              <IconBtn name="x" title="Quitar asignacion" disabled={saving} onClick={() => quitar(p)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BiohuertoModal({ open, mode, row, onClose, onSave, canManageOwners, cultivos = [] }) {
  const confirm = useConfirm();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [tiposArea, setTiposArea] = useState([]);
  const [nuevoTipo, setNuevoTipo] = useState(false);
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState("");
  const [creandoTipo, setCreandoTipo] = useState(false);
  // ¿el usuario editó código/abreviatura a mano? (para no pisar sus cambios)
  const [touched, setTouched] = useState({ codigo: false, abreviatura: false });

  // Cargar catálogo de tipos de área al abrir el formulario.
  useEffect(() => {
    if (!open || mode === "view") return;
    let cancel = false;
    (async () => {
      try {
        const data = await catalogosApi.list("tipos-area");
        const items = Array.isArray(data) ? data : data?.items || [];
        if (!cancel) setTiposArea(items);
      } catch {
        if (!cancel) setTiposArea([]);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    setNuevoTipo(false);
    setNuevoTipoNombre("");
    // Al crear, el código/abreviatura arrancan en "auto"; al editar, se respetan los existentes.
    setTouched({ codigo: mode === "edit", abreviatura: mode === "edit" });
    if (mode === "edit" && row) {
      setForm({
        nombre: row.nombre || "",
        codigo: row.codigo || "",
        abreviatura: row.abreviatura || "",
        ubicacion_referencia: row.ubicacion_referencia || "",
        area_m2: row.area_m2 ?? "",
        tipo_area_id: row.tipo_area_id ?? "",
        estado: row.estado || "nuevo",
        grid_filas: row.grid_filas || 4,
        grid_columnas: row.grid_columnas || 4,
        es_publico: row.es_publico ?? false,
        latitud: row.latitud ?? "",
        longitud: row.longitud ?? "",
        descripcion: row.descripcion || "",
        imagen: row.imagen || "",
      });
    } else if (mode === "new") {
      setForm(EMPTY_FORM);
    }
  }, [open, mode, row]);

  // En modo nuevo, preseleccionar el tipo de área 'biohuerto' por defecto.
  useEffect(() => {
    if (mode !== "new" || form.tipo_area_id || tiposArea.length === 0) return;
    const def =
      tiposArea.find((t) => t.codigo === "biohuerto") || tiposArea[0];
    if (def) setForm((f) => ({ ...f, tipo_area_id: def.id }));
  }, [mode, tiposArea, form.tipo_area_id]);

  if (!open) return null;
  const view = mode === "view";
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const stepGrid = async (key, delta) => {
    const current = Number(form[key] || 4);
    const next = Math.min(30, Math.max(1, current + delta));
    // Increasing or new biohuerto: no conflict possible.
    if (next >= current || !row?.id) {
      setForm((f) => ({ ...f, [key]: next }));
      return;
    }
    // Reducing: check for cultivos with celdas in the removed rows/columns.
    const biohuertoCultivos = cultivos.filter(
      (c) => String(c.biohuerto_id) === String(row.id) && c.is_active !== false
    );
    const affected = biohuertoCultivos.filter((c) => {
      const celdas = normalizeCeldas(c);
      if (key === "grid_filas") return celdas.some((celda) => celda.fila > next);
      return celdas.some((celda) => celda.columna > next);
    });
    if (affected.length > 0) {
      const label = key === "grid_filas" ? "fila" : "columna";
      const nombres = [...new Set(affected.map((c) => c.especie || "Cultivo"))].join(", ");
      const ok = await confirm({
        tone: "warning",
        question: `¿Quitar esta ${label} del mapa?`,
        message: `Los cultivos "${nombres}" tienen celdas en la ${label} que se eliminaría del mapa. Si guardas este cambio, esas celdas quedarán fuera de los límites. ¿Deseas continuar de todas formas?`,
        confirmLabel: "Sí, continuar",
      });
      if (!ok) return;
    }
    setForm((f) => ({ ...f, [key]: next }));
  };

  // Auto-sugerencia de código/abreviatura desde el nombre (solo al crear, y
  // mientras el usuario no los haya editado a mano).
  const onNombre = (e) => {
    const nombre = e.target.value;
    setForm((f) => {
      const next = { ...f, nombre };
      if (mode === "new") {
        const abbr = abbrevFromName(nombre);
        if (!touched.abreviatura) next.abreviatura = abbr;
        if (!touched.codigo) next.codigo = abbr ? `${abbr}-001` : "";
      }
      return next;
    });
  };
  const onCodigo = (e) => {
    setTouched((t) => ({ ...t, codigo: true }));
    setForm((f) => ({ ...f, codigo: e.target.value }));
  };
  const onAbreviatura = (e) => {
    setTouched((t) => ({ ...t, abreviatura: true }));
    setForm((f) => ({ ...f, abreviatura: e.target.value }));
  };

  const crearTipoArea = async () => {
    const nombre = nuevoTipoNombre.trim();
    if (!nombre) return;
    setCreandoTipo(true);
    try {
      const creado = await catalogosApi.create("tipos-area", { nombre });
      const data = await catalogosApi.list("tipos-area");
      const items = Array.isArray(data) ? data : data?.items || [];
      setTiposArea(items);
      const nuevoId =
        creado?.id ?? items.find((t) => t.nombre === nombre)?.id ?? "";
      if (nuevoId) setForm((f) => ({ ...f, tipo_area_id: nuevoId }));
      setNuevoTipo(false);
      setNuevoTipoNombre("");
    } finally {
      setCreandoTipo(false);
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const body = {
        nombre: form.nombre,
        codigo: form.codigo,
        abreviatura: form.abreviatura,
        ubicacion_referencia: form.ubicacion_referencia,
        area_m2: form.area_m2 === "" ? null : Number(form.area_m2),
        tipo_area_id:
          form.tipo_area_id === "" ? null : Number(form.tipo_area_id),
        estado: form.estado,
        grid_filas: Number(form.grid_filas) || 4,
        grid_columnas: Number(form.grid_columnas) || 4,
        es_publico: form.es_publico,
        latitud: form.latitud === "" ? null : Number(form.latitud),
        longitud: form.longitud === "" ? null : Number(form.longitud),
        descripcion: form.descripcion,
      };
      // Solo enviar la imagen si cambió respecto a la guardada (null la elimina).
      if ((form.imagen || "") !== (row?.imagen || "")) {
        body.imagen = form.imagen || null;
      }
      await onSave(body, mode, row?.id);
    } finally {
      setSaving(false);
    }
  };

  const tint = view ? tintFor(row?.nombre) : "default";

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={mode === "view" ? 640 : 920}
      title={
        view
          ? row?.nombre
          : mode === "edit"
            ? "Editar ficha de biohuerto"
            : "Registrar ficha de biohuerto"
      }
      subtitle={
        view
          ? `${row?.codigo} · ${row?.ubicacion_referencia || "Sin ubicación"}`
          : "Datos de la unidad productiva comunitaria"
      }
      footer={
        view ? null : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Registrar ficha"}
            </Button>
          </>
        )
      }
    >
      {view ? (
        <div className="grid gap-[18px]">
          <Photo
            tint={tint}
            height={180}
            radius={14}
            src={row?.imagen}
            label={`foto: ${(row?.nombre || "").toLowerCase()}`}
          />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Código" value={row?.codigo} />
            <Stat label="Ubicación de referencia" value={row?.ubicacion_referencia || "Sin ubicación"} />
            <Stat label="Área disponible" value={`${row?.area_m2} m²`} />
            <Stat label="Cultivos activos" value={row?.cultivos_count ?? 0} />
            <Stat label="Tipo de área" value={row?.tipo_area || "Sin tipo"} />
            <Stat label="Estado" value={estadoLabel(row?.estado)} />
            <Stat label="Mapa de siembra" value={`${row?.grid_filas || 4} x ${row?.grid_columnas || 4}`} />
            <Stat
              label="Coordenadas"
              value={
                row?.latitud != null && row?.longitud != null
                  ? `${row.latitud}, ${row.longitud}`
                  : "Sin coordenadas"
              }
            />
          </div>
          <div className="rounded-xl border border-line bg-white px-4 py-[14px]">
            <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted-2">
              Descripción
            </div>
            <div className="mt-[6px] text-[14.5px] leading-[1.5] text-text">
              {row?.descripcion || "Sin descripción"}
            </div>
          </div>
          {canManageOwners && <AsignacionProductores biohuerto={row} />}
        </div>
      ) : (
        <div className="grid gap-7 lg:grid-cols-[1fr_1.05fr]">
          {/* IZQUIERDA · Identidad y datos */}
          <div className="flex flex-col gap-[18px]">
            <Step n="1" title="Datos del biohuerto" />
            <Field label="Nombre del biohuerto" hint="Al escribirlo se sugieren el código y la abreviatura">
              <Input value={form.nombre} onChange={onNombre} placeholder="Ej: Loma Verde" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Código" hint="Automático · editable">
                <Input value={form.codigo} onChange={onCodigo} placeholder="LV-001" />
              </Field>
              <Field label="Abreviatura" hint="Automática · editable">
                <Input value={form.abreviatura} onChange={onAbreviatura} placeholder="Ej: LV" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo de área">
                {nuevoTipo ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={nuevoTipoNombre}
                      onChange={(e) => setNuevoTipoNombre(e.target.value)}
                      placeholder="Nombre del tipo"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          crearTipoArea();
                        }
                      }}
                    />
                    <Button size="sm" onClick={crearTipoArea} disabled={creandoTipo || !nuevoTipoNombre.trim()}>
                      {creandoTipo ? "…" : "Guardar"}
                    </Button>
                    <IconBtn
                      name="x"
                      title="Cancelar"
                      onClick={() => {
                        setNuevoTipo(false);
                        setNuevoTipoNombre("");
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select value={form.tipo_area_id} onChange={set("tipo_area_id")} className="flex-1">
                      <option value="">Selecciona un tipo</option>
                      {tiposArea.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </Select>
                    <Button variant="secondary" size="sm" icon="plus" onClick={() => setNuevoTipo(true)}>
                      Nuevo
                    </Button>
                  </div>
                )}
              </Field>
              <Field label="Estado">
                <Select value={form.estado} onChange={set("estado")}>
                  {ESTADO_OPCIONES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Foto del biohuerto (opcional)">
              <ImageUpload
                key={row?.id || "new"}
                defaultUrl={row?.imagen || ""}
                height={150}
                onChange={(url) => setForm((f) => ({ ...f, imagen: url }))}
              />
            </Field>
            <Field label="Acceso al biohuerto">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, es_publico: false }))}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 py-[10px] text-[13.5px] font-extrabold transition-all ${
                    !form.es_publico
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-line text-muted-2 hover:border-primary/30"
                  }`}
                >
                  <Icon name="lock" size={15} />
                  Privado
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, es_publico: true }))}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-3 py-[10px] text-[13.5px] font-extrabold transition-all ${
                    form.es_publico
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-line text-muted-2 hover:border-primary/30"
                  }`}
                >
                  <Icon name="globe" size={15} />
                  Público
                </button>
              </div>
              <p className="mt-[6px] text-[12px] font-semibold text-muted-2">
                {form.es_publico
                  ? "Todos los productores pueden ver y sembrar en este biohuerto."
                  : "Solo los productores asignados manualmente pueden acceder."}
              </p>
            </Field>
            <Field label="Descripción (opcional)">
              <Textarea
                value={form.descripcion}
                onChange={set("descripcion")}
                placeholder="Describe la unidad productiva…"
              />
            </Field>
          </div>

          {/* DERECHA · Ubicación y tamaño */}
          <div className="flex flex-col gap-[18px]">
            <Step n="2" title="Ubicación" hint="busca, dicta o toca el mapa" />
            <div className="flex min-h-[380px] flex-1 flex-col">
              <AddressPicker
                label=""
                value={form.ubicacion_referencia}
                areaM2={form.area_m2}
                initialCenter={
                  row?.latitud != null && row?.longitud != null
                    ? { lat: Number(row.latitud), lng: Number(row.longitud) }
                    : null
                }
                onChange={(direccion, coords) =>
                  setForm((f) => ({
                    ...f,
                    ubicacion_referencia: direccion,
                    latitud: coords ? coords.lat : "",
                    longitud: coords ? coords.lng : "",
                  }))
                }
              />
            </div>
            <Step n="3" title="Área disponible" hint="se dibuja como un cuadro en el mapa" />
            <Field label="Área disponible (m²)">
              <Input type="number" value={form.area_m2} onChange={set("area_m2")} placeholder="Ej: 200" />
            </Field>
          </div>

          {/* Distribución del biohuerto (a todo el ancho) */}
          <div className="lg:col-span-2">
            <Step n="4" title="Distribución del biohuerto" hint="filas × columnas de siembra" />
            <div className="mt-[14px] grid grid-cols-2 gap-4">
              <Field label="Filas del mapa">
                <div className="flex gap-2">
                  <IconBtn name="minus" title="Quitar fila" onClick={() => stepGrid("grid_filas", -1)} />
                  <Input type="number" min="1" max="30" value={form.grid_filas} onChange={set("grid_filas")} placeholder="4" />
                  <IconBtn name="plus" title="Agregar fila" onClick={() => stepGrid("grid_filas", 1)} />
                </div>
              </Field>
              <Field label="Columnas del mapa">
                <div className="flex gap-2">
                  <IconBtn name="minus" title="Quitar columna" onClick={() => stepGrid("grid_columnas", -1)} />
                  <Input type="number" min="1" max="30" value={form.grid_columnas} onChange={set("grid_columnas")} placeholder="4" />
                  <IconBtn name="plus" title="Agregar columna" onClick={() => stepGrid("grid_columnas", 1)} />
                </div>
              </Field>
            </div>
            <div className="mt-[14px]">
              <Field label="Vista previa de la distribución">
                <BiohuertoGrid
                  biohuerto={{ grid_filas: form.grid_filas, grid_columnas: form.grid_columnas }}
                  cultivos={[]}
                  selected={[]}
                  readonly
                  compact
                />
              </Field>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Biohuertos() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const [cultivos, setCultivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [ubic, setUbic] = useState("");
  const [view, setView] = useState(() => localStorage.getItem("bh-bioview") || "cards");
  const [modal, setModal] = useState(null); // { mode, row }
  const [siembraModal, setSiembraModal] = useState(null); // { biohuerto, celdas }
  const [cultivoDetalle, setCultivoDetalle] = useState(null);

  const ubicaciones = useMemo(
    () => [...new Set(rows.map((b) => b.ubicacion_referencia).filter(Boolean))],
    [rows]
  );

  useEffect(() => {
    localStorage.setItem("bh-bioview", view);
  }, [view]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await biohuertosApi.list();
      setRows(Array.isArray(data) ? data : data?.items || []);
      const cultivosData = await cultivosApi.list();
      setCultivos(Array.isArray(cultivosData) ? cultivosData : cultivosData?.items || []);
    } catch {
      toast("No se pudieron cargar los biohuertos", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows
    .filter(
      (b) =>
        (!q ||
          `${b.nombre} ${b.codigo} ${b.ubicacion_referencia || ""}`
            .toLowerCase()
            .includes(q.toLowerCase())) &&
        (!ubic || b.ubicacion_referencia === ubic)
    )
    // Activos primero, conservando el orden original dentro de cada grupo.
    .sort((a, b) => Number(b.is_active ?? true) - Number(a.is_active ?? true));

  const actions = {
    view: (b) => setModal({ mode: "view", row: b }),
    edit: (b) => setModal({ mode: "edit", row: b }),
    toggle: (b) => handleToggleActive(b),
    eliminar: (b) => handleDelete(b),
  };

  const handleSave = async (body, mode, id) => {
    try {
      if (mode === "edit") {
        await biohuertosApi.update(id, body);
        toast("Biohuerto actualizado");
      } else {
        await biohuertosApi.create(body);
        toast("Biohuerto creado");
      }
      setModal(null);
      await load();
    } catch {
      toast(
        mode === "edit"
          ? "No se pudo actualizar el biohuerto"
          : "No se pudo crear el biohuerto",
        "danger"
      );
    }
  };

  const handleToggleActive = async (row) => {
    const ok = await confirm(
      row.is_active ? bajaDialog(row.nombre) : reactivarDialog(row.nombre)
    );
    if (!ok) return;
    try {
      await biohuertosApi.update(row.id, { is_active: !row.is_active });
      toast(row.is_active ? "Biohuerto dado de baja" : "Biohuerto reactivado");
      setModal(null);
      await load();
    } catch {
      toast("No se pudo cambiar el estado", "danger");
    }
  };

  const handleGridChange = async (biohuerto, changes) => {
    try {
      await biohuertosApi.update(biohuerto.id, changes);
      // Update parent state silently so other views stay consistent
      setRows((prev) =>
        prev.map((r) => (r.id === biohuerto.id ? { ...r, ...changes } : r))
      );
    } catch {
      toast("No se pudo actualizar el mapa del biohuerto", "danger");
    }
  };

  const handleDelete = async (row) => {
    const ok = await confirm(eliminarDialog(row.nombre));
    if (!ok) return;
    try {
      await biohuertosApi.remove(row.id);
      toast("Biohuerto eliminado");
      setModal((m) => (m?.row?.id === row.id ? null : m));
      await load();
    } catch (err) {
      if (err?.response?.status === 409) {
        notify(referenciadoDialog());
      } else {
        toast("No se pudo eliminar el biohuerto", "danger");
      }
    }
  };

  return (
    <div className="animate-fade">
      <PageHeader
        title="Directorio de fichas de biohuertos"
        subtitle="Administra las unidades productivas comunitarias, su extensión y capacidad de cultivo activo."
        action={
          <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
            Nuevo biohuerto
          </Button>
        }
      />

      <Card
        pad="p-5"
        className="mb-6"
        style={{ background: "var(--chip-2)", border: "1px solid var(--line)" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Buscar por nombre o código" className="flex-1">
            <SearchInput
              placeholder="Buscar por nombre o código…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Field>
          <Field label="Ubicación de referencia" className="sm:w-[260px]">
            <Select value={ubic} onChange={(e) => setUbic(e.target.value)}>
              <option value="">Todas las ubicaciones</option>
              {ubicaciones.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </Card>

      {loading ? (
        <EmptyState icon="sprout" title="Cargando biohuertos…" desc="Un momento por favor." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="sprout"
          title="No hay biohuertos"
          desc={
            q
              ? "Ningún biohuerto coincide con tu búsqueda."
              : "Aún no se han registrado fichas de biohuertos."
          }
          action={
            !q && (
              <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
                Nuevo biohuerto
              </Button>
            )
          }
        />
      ) : view === "cards" ? (
        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))" }}
        >
          {filtered.map((b) => (
            <BiohuertoCard key={b.id} b={b} actions={actions} />
          ))}
        </div>
      ) : view === "map" ? (
        <BiohuertoMapView
          biohuertos={filtered}
          cultivos={cultivos}
          onFreeCell={(biohuerto, celdas) => setSiembraModal({ biohuerto, celdas })}
          onBusyCell={(cultivo) => setCultivoDetalle(cultivo)}
          onGridChange={handleGridChange}
        />
      ) : (
        <BiohuertoList rows={filtered} actions={actions} />
      )}

      {!loading && filtered.length > 0 && (
        <div className="mt-7 border-t border-line pt-[22px] text-sm text-muted-2">
          Mostrando {filtered.length} de {rows.length} biohuertos registrados
        </div>
      )}

      <BiohuertoModal
        open={!!modal}
        mode={modal?.mode}
        row={modal?.row}
        canManageOwners={user?.rol === "admin"}
        onClose={() => setModal(null)}
        onSave={handleSave}
        cultivos={cultivos}
      />
      <SiembraCeldaModal
        open={!!siembraModal}
        data={siembraModal}
        cultivos={cultivos}
        onClose={() => setSiembraModal(null)}
        onSaved={async () => {
          setSiembraModal(null);
          await load();
        }}
      />
      <CultivoCeldaDetalle
        cultivo={cultivoDetalle}
        onClose={() => setCultivoDetalle(null)}
        onOpenCultivos={() => navigate("/cultivos")}
      />
    </div>
  );
}
