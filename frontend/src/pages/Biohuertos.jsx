import { useEffect, useMemo, useState } from "react";
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
import { biohuertosApi, catalogosApi } from "../lib/resources.js";
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
              {dim && (
                <span className="absolute left-[14px] top-[14px]">
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
        style={{ gridTemplateColumns: "1.5fr 1.4fr .8fr .9fr .7fr 1fr" }}
      >
        <div>Biohuerto</div>
        <div>Ubicación de referencia</div>
        <div>Área disp.</div>
        <div>Cultivos activos</div>
        <div>Estado</div>
        <div className="text-right">Acciones</div>
      </div>
      {rows.map((b) => {
        const dim = !b.is_active;
        return (
          <div
            key={b.id}
            className="grid items-center gap-3 border-b border-line px-[22px] py-[15px] last:border-b-0"
            style={{ gridTemplateColumns: "1.5fr 1.4fr .8fr .9fr .7fr 1fr" }}
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

function BiohuertoModal({ open, mode, row, onClose, onSave }) {
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
        </div>
      )}
    </Modal>
  );
}

export default function Biohuertos() {
  const toast = useToast();
  const confirm = useConfirm();
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [ubic, setUbic] = useState("");
  const [view, setView] = useState(() => localStorage.getItem("bh-bioview") || "cards");
  const [modal, setModal] = useState(null); // { mode, row }

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
        onClose={() => setModal(null)}
        onSave={handleSave}
      />
    </div>
  );
}
