import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  PageHeader,
  Button,
  IconBtn,
  Card,
  Field,
  Input,
  Select,
  SearchInput,
  ImageUpload,
  Modal,
  EmptyState,
  EtapaBadge,
  Toggle,
} from "../components/ui/primitives.jsx";
import Icon from "../components/ui/Icon.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import { useConfirm, eliminarDialog, bajaDialog, reactivarDialog } from "../components/ui/Confirm.jsx";
import { ETAPAS, ETAPA_ORDER, tintFor, tintGradient, fmtFecha } from "../lib/theme.js";
import {
  cultivosApi,
  biohuertosApi,
  catalogosApi,
  campaniasApi,
} from "../lib/resources.js";

const QUICK_SECTIONS = [
  { id: "monitoreo", label: "Monitoreo", icon: "activity" },
  { id: "diagnostico", label: "Diagnóstico fitosanitario", icon: "stethoscope" },
  { id: "incidencias", label: "Gestión de incidencias", icon: "alertTri" },
  { id: "recomendaciones", label: "Recomendaciones", icon: "bulb" },
  { id: "practicas", label: "Prácticas agrícolas", icon: "recycle" },
  { id: "costos", label: "Costos", icon: "coins" },
  { id: "cuidados", label: "Cuidados", icon: "drop" },
];

/* ---------------- Menú desplegable de accesos rápidos ---------------- */
function SectionMenu({ cultivoId, navigate }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  };

  const toggle = () => {
    if (!open) place();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        title="Ir a sección"
        onClick={toggle}
        className={`grid h-9 w-9 place-items-center rounded-[9px] border-none transition-colors ${
          open ? "bg-primary text-white" : "bg-transparent text-muted-1 hover:bg-chip"
        }`}
      >
        <Icon name="chevDown" size={18} />
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div
              className="fixed z-50 w-[220px] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-modal animate-fade"
              style={{ top: pos.top, right: pos.right }}
            >
              {QUICK_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/cultivos/${cultivoId}?section=${s.id}`);
                  }}
                  className="flex w-full items-center gap-[10px] px-4 py-[10px] text-left text-[13.5px] font-semibold text-muted-1 transition-colors hover:bg-chip hover:text-primary"
                >
                  <Icon name={s.icon} size={16} />
                  {s.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}

const COLS = "2fr 1fr .9fr .9fr .9fr 1.5fr";
const HEAD = ["Cultivo", "Biohuerto", "Etapa", "Fecha est.", "Campaña", "Acciones"];

const EMPTY_FORM = {
  especie_id: "",
  unidad_id: "",
  variedad: "",
  biohuerto_id: "",
  etapa_id: "",
  campania_id: "",
  fecha_siembra: "",
  fecha_estimada_cosecha: "",
  cantidad: "",
  area_m2: "",
  notas: "",
  foto: "",
};

export default function Cultivos() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState([]);
  const [biohuertos, setBiohuertos] = useState([]);
  const [especies, setEspecies] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [etapasCat, setEtapasCat] = useState([]);
  const [campanias, setCampanias] = useState([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [bio, setBio] = useState("");
  const [etapa, setEtapa] = useState("");
  const [view, setView] = useState(() => localStorage.getItem("bh-cropview") || "list");

  const [formModal, setFormModal] = useState(null); // { mode: "new"|"edit", row }
  const [detailModal, setDetailModal] = useState(null); // cultivo a mostrar (solo lectura)

  useEffect(() => {
    localStorage.setItem("bh-cropview", view);
  }, [view]);

  const loadCultivos = async () => {
    setLoading(true);
    try {
      const data = await cultivosApi.list();
      setRows(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudieron cargar los cultivos", "danger");
    } finally {
      setLoading(false);
    }
  };

  const asList = (data) => (Array.isArray(data) ? data : data?.items || []);

  const loadEspecies = () =>
    catalogosApi
      .list("especies")
      .then((d) => setEspecies(asList(d)))
      .catch(() => setEspecies([]));
  const loadUnidades = () =>
    catalogosApi
      .list("unidades")
      .then((d) => setUnidades(asList(d)))
      .catch(() => setUnidades([]));

  useEffect(() => {
    loadCultivos();
    biohuertosApi
      .list()
      .then((data) => setBiohuertos(asList(data)))
      .catch(() => setBiohuertos([]));
    loadEspecies();
    loadUnidades();
    catalogosApi
      .list("etapas")
      .then((d) => setEtapasCat(asList(d)))
      .catch(() => setEtapasCat([]));
    campaniasApi
      .list()
      .then((d) => setCampanias(asList(d)))
      .catch(() => setCampanias([]));
  }, []);

  const campanas = useMemo(
    () => [...new Set(rows.map((c) => c.campania).filter(Boolean))],
    [rows]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((c) => {
      const hay = `${c.especie || ""}${c.variedad || ""}${c.biohuerto_nombre || ""}`.toLowerCase();
      return (
        (!term || hay.includes(term)) &&
        (!bio || String(c.biohuerto_id) === String(bio)) &&
        (!etapa || c.etapa === etapa)
      );
    })
      // Activos primero, conservando el orden original dentro de cada grupo.
      .sort((a, b) => Number(b.is_active ?? true) - Number(a.is_active ?? true));
  }, [rows, q, bio, etapa]);

  const handleSubmit = async (form, mode, id) => {
    const payload = {
      // biohuerto_id ahora es un UUID (string), no se convierte a número.
      biohuerto_id: form.biohuerto_id || null,
      especie_id: form.especie_id === "" ? null : Number(form.especie_id),
      unidad_id: form.unidad_id === "" ? null : Number(form.unidad_id),
      etapa_id: form.etapa_id === "" ? null : Number(form.etapa_id),
      campania_id: form.campania_id === "" ? null : Number(form.campania_id),
      variedad: form.variedad.trim() || null,
      fecha_siembra: form.fecha_siembra || null,
      fecha_estimada_cosecha: form.fecha_estimada_cosecha || null,
      cantidad: form.cantidad === "" ? null : Number(form.cantidad),
      area_m2: form.area_m2 === "" ? null : Number(form.area_m2),
      notas: form.notas.trim() || null,
    };
    // Solo enviar la imagen si cambió respecto a la guardada (null la elimina).
    const original = mode === "edit" ? rows.find((r) => r.id === id) : null;
    if ((form.foto || "") !== (original?.imagen || "")) {
      payload.imagen = form.foto || null;
    }
    try {
      if (mode === "edit") {
        await cultivosApi.update(id, payload);
        toast("Cambios guardados");
      } else {
        await cultivosApi.create(payload);
        toast("Cultivo registrado");
      }
      setFormModal(null);
      loadCultivos();
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo guardar el cultivo", "danger");
    }
  };

  const handleDelete = async (row) => {
    const ok = await confirm(eliminarDialog(row.especie));
    if (!ok) return;
    try {
      await cultivosApi.remove(row.id);
      toast("Cultivo eliminado");
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo eliminar el cultivo", "danger");
    } finally {
      loadCultivos();
    }
  };

  const toggleActive = async (row) => {
    const ok = await confirm(
      row.is_active ? bajaDialog(row.especie) : reactivarDialog(row.especie)
    );
    if (!ok) return;
    try {
      await cultivosApi.update(row.id, { is_active: !row.is_active });
      toast(row.is_active ? "Cultivo dado de baja" : "Cultivo reactivado");
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo cambiar el estado", "danger");
    } finally {
      loadCultivos();
    }
  };

  return (
    <div className="animate-fade">
      <PageHeader
        title="Gestión de Cultivos"
        subtitle="Supervisión y control de especies activas"
        action={
          <Button icon="plus" onClick={() => setFormModal({ mode: "new" })}>
            Registrar cultivo
          </Button>
        }
      />

      {/* Filtros */}
      <div className="mb-[18px] grid grid-cols-1 gap-[18px] md:grid-cols-3">
        <Field label="Biohuerto">
          <Select value={bio} onChange={(e) => setBio(e.target.value)}>
            <option value="">Todos los biohuertos</option>
            {biohuertos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Etapa fenológica">
          <Select value={etapa} onChange={(e) => setEtapa(e.target.value)}>
            <option value="">Todas las etapas</option>
            {ETAPA_ORDER.map((e) => (
              <option key={e} value={e}>
                {ETAPAS[e].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Campaña / Temporada">
          <Select value="" onChange={() => {}} disabled={campanas.length === 0}>
            <option value="">Todas las campañas</option>
            {campanas.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>

      {/* Búsqueda + toggle de vista */}
      <div className="mb-[22px] flex items-stretch gap-3">
        <SearchInput
          className="flex-1"
          placeholder="Buscar por especie, variedad o biohuerto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="inline-flex gap-1 rounded-xl bg-chip p-[5px]">
          {[
            { id: "list", icon: "list", title: "Vista lista" },
            { id: "cards", icon: "grid", title: "Vista tarjetas" },
          ].map((v) => (
            <button
              key={v.id}
              title={v.title}
              onClick={() => setView(v.id)}
              className={`grid h-9 w-10 place-items-center rounded-[9px] transition-all ${
                view === v.id
                  ? "bg-white text-primary shadow-[0_1px_3px_rgba(20,40,30,.12)]"
                  : "bg-transparent text-muted-2"
              }`}
            >
              <Icon name={v.icon} size={18} />
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card pad="" className="px-6 py-12 text-center text-muted-2">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-primary" />
          <div className="text-[14.5px] font-semibold">Cargando cultivos…</div>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="leaf"
          title="Sin cultivos para estos filtros"
          desc="Ajusta los filtros o registra un nuevo cultivo para empezar a hacer seguimiento."
          action={
            <Button icon="plus" onClick={() => setFormModal({ mode: "new" })}>
              Registrar cultivo
            </Button>
          }
        />
      ) : view === "cards" ? (
        <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(270px,1fr))]">
          {filtered.map((c) => (
            <CultivoCard
              key={c.id}
              c={c}
              navigate={navigate}
              onOpen={() => setDetailModal(c)}
              onEdit={() => setFormModal({ mode: "edit", row: c })}
              onToggle={() => toggleActive(c)}
              onDelete={() => handleDelete(c)}
            />
          ))}
        </div>
      ) : (
        <Card pad="" className="overflow-hidden">
          {/* Cabecera de tabla */}
          <div
            className="grid gap-4 border-b border-line bg-chip px-[26px] py-4"
            style={{ gridTemplateColumns: COLS }}
          >
            {HEAD.map((h, i) => (
              <div
                key={h}
                className={`text-[12px] font-extrabold uppercase tracking-[.07em] text-muted-2 ${
                  i === HEAD.length - 1 ? "text-right" : "text-left"
                }`}
              >
                {h}
              </div>
            ))}
          </div>

          {filtered.map((c) => {
            const dim = c.is_active === false;
            return (
              <div key={c.id} className="border-b border-line last:border-b-0">
                <div
                  className="grid items-center gap-4 px-[26px] py-[18px]"
                  style={{ gridTemplateColumns: COLS }}
                >
                  {/* Cultivo */}
                  <div className="flex min-w-0 items-center gap-[13px]">
                    <div className="flex min-w-0 flex-col gap-[2px]">
                      <div
                        className={`truncate text-[15.5px] font-extrabold ${
                          dim ? "text-muted-2" : "text-text"
                        }`}
                      >
                        {c.especie}
                      </div>
                      <div className="truncate text-[12.5px] font-semibold text-muted-2">
                        {[
                          c.variedad,
                          c.cantidad != null
                            ? `${c.cantidad} ${c.unidad || "und"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Sin variedad"}
                      </div>
                    </div>
                  </div>

                  {/* Biohuerto */}
                  <div>
                    <span className="inline-flex items-center gap-[7px] text-[14px] text-muted-1">
                      <Icon name="pin" size={15} />
                      {c.biohuerto_nombre || "Sin biohuerto"}
                    </span>
                  </div>

                  {/* Etapa */}
                  <div>
                    <EtapaBadge etapa={c.etapa} nombre={c.etapa_nombre} />
                  </div>

                  {/* Fecha estimada */}
                  <div>
                    <span className="whitespace-nowrap font-mono text-[13px] text-muted-1">
                      {fmtFecha(c.fecha_estimada_cosecha)}
                    </span>
                  </div>

                  {/* Campaña */}
                  <div>
                    <span className="text-[13.5px] text-muted-1">{c.campania || "Sin campaña"}</span>
                  </div>

                  {/* Acciones */}
                  <div className="ml-auto flex items-center gap-[2px]">
                    <IconBtn name="eye" title="Ver detalle" onClick={() => setDetailModal(c)} />
                    <IconBtn
                      name="edit"
                      title={dim ? "Reactiva el cultivo para editarlo" : "Editar"}
                      disabled={dim}
                      onClick={() => setFormModal({ mode: "edit", row: c })}
                    />
                    <Toggle
                      on={c.is_active}
                      title={c.is_active ? "Dar de baja" : "Reactivar"}
                      onClick={() => toggleActive(c)}
                    />
                    <IconBtn
                      name="trash"
                      title="Eliminar"
                      tone="danger"
                      onClick={() => handleDelete(c)}
                    />
                    <SectionMenu cultivoId={c.id} navigate={navigate} />
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <CultivoFormModal
        open={!!formModal}
        mode={formModal?.mode}
        cultivo={formModal?.row}
        biohuertos={biohuertos}
        especies={especies}
        unidades={unidades}
        etapasCat={etapasCat}
        campanias={campanias}
        onReloadEspecies={loadEspecies}
        onReloadUnidades={loadUnidades}
        onClose={() => setFormModal(null)}
        onSave={handleSubmit}
      />

      <CultivoDetalleModal cultivo={detailModal} onClose={() => setDetailModal(null)} />
    </div>
  );
}

/* ---------------- Tarjeta de cultivo (vista cards) ---------------- */
function CultivoCard({ c, navigate, onOpen, onEdit, onToggle, onDelete }) {
  const dim = c.is_active === false;
  return (
    <Card pad="" hover className={`overflow-hidden ${dim ? "opacity-[.62]" : ""}`}>
      <div
        className="relative flex h-[150px] items-start justify-end overflow-hidden p-3"
        style={{ background: tintGradient(dim ? "default" : tintFor(c.especie)) }}
      >
        {c.imagen && (
          <img
            src={c.imagen}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <EtapaBadge etapa={c.etapa} nombre={c.etapa_nombre} className="relative z-10" />
      </div>
      <div className="p-5">
        <h3 className="m-0 text-xl font-extrabold text-primary">{c.especie}</h3>
        <div className="mt-[5px] text-sm font-bold text-terracotta">
          Variedad: {c.variedad || "Sin variedad"}
        </div>
        <div className="mt-4 grid gap-[9px]">
          <MetaLine icon="pin" text={`Biohuerto: ${c.biohuerto_nombre || "Sin biohuerto"}`} />
          <MetaLine icon="leaf" text={`Cosecha est.: ${fmtFecha(c.fecha_estimada_cosecha)}`} />
          <MetaLine icon="leaf" text={`Campaña: ${c.campania || "Sin campaña"}`} />
        </div>
        <div className="mt-[18px] flex items-center gap-[10px] border-t border-line pt-4">
          <Button variant="ghost" icon="eye" size="sm" full onClick={onOpen}>
            Detalles
          </Button>
          <IconBtn
            name="edit"
            title={dim ? "Reactiva el cultivo para editarlo" : "Editar"}
            disabled={dim}
            onClick={onEdit}
          />
          <Toggle
            on={c.is_active}
            title={c.is_active ? "Dar de baja" : "Reactivar"}
            onClick={onToggle}
          />
          <IconBtn name="trash" title="Eliminar" tone="danger" onClick={onDelete} />
          <SectionMenu cultivoId={c.id} navigate={navigate} />
        </div>
      </div>
    </Card>
  );
}

function MetaLine({ icon, text }) {
  return (
    <div className="flex items-center gap-[9px] text-sm text-muted-1">
      <span className="flex-shrink-0 text-muted-2">
        <Icon name={icon} size={16} />
      </span>
      <span>{text}</span>
    </div>
  );
}

/* ---------------- Select de catálogo con "+ Nuevo" inline ---------------- */
// Para catálogos extensibles (especie, unidad): muestra un Select más un botón
// "+ Nuevo" que abre un mini-formulario para crear un ítem por nombre.
function CatalogoSelect({ value, onChange, options, placeholder, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    const n = nombre.trim();
    if (!n) return;
    setSaving(true);
    try {
      const creado = await onAdd(n);
      if (creado?.id != null) onChange(String(creado.id));
      setAdding(false);
      setNombre("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-stretch gap-2">
        <div className="flex-1">
          <Select value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{placeholder}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </Select>
        </div>
        {onAdd && (
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            title="Agregar nuevo"
            onClick={() => {
              setNombre("");
              setAdding(true);
            }}
          >
            Nuevo
          </Button>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex items-stretch gap-2 rounded-xl border border-line bg-chip p-2">
          <div className="flex-1">
            <Input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              placeholder="Nombre del nuevo elemento"
            />
          </div>
          <Button size="sm" icon="check" onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Agregar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </>
  );
}

/* ---------------- Modal Registrar / Editar cultivo ---------------- */
function CultivoFormModal({
  open,
  mode,
  cultivo,
  biohuertos,
  especies,
  unidades,
  etapasCat,
  campanias,
  onReloadEspecies,
  onReloadUnidades,
  onClose,
  onSave,
}) {
  const isEdit = mode === "edit";
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm({
      especie_id: cultivo?.especie_id != null ? String(cultivo.especie_id) : "",
      unidad_id: cultivo?.unidad_id != null ? String(cultivo.unidad_id) : "",
      variedad: cultivo?.variedad || "",
      biohuerto_id: cultivo?.biohuerto_id != null ? String(cultivo.biohuerto_id) : "",
      etapa_id: cultivo?.etapa_id != null ? String(cultivo.etapa_id) : "",
      campania_id: cultivo?.campania_id != null ? String(cultivo.campania_id) : "",
      fecha_siembra: (cultivo?.fecha_siembra || "").split("T")[0].split(" ")[0],
      fecha_estimada_cosecha: (cultivo?.fecha_estimada_cosecha || "")
        .split("T")[0]
        .split(" ")[0],
      cantidad: cultivo?.cantidad ?? "",
      area_m2: cultivo?.area_m2 ?? "",
      notas: cultivo?.notas || "",
      foto: cultivo?.imagen || "",
    });
  }, [open, cultivo]);

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Crea un elemento de catálogo, recarga la lista y devuelve el creado para
  // poder seleccionarlo inmediatamente.
  const addCatalogo = (catalogo, reload, label) => async (nombre) => {
    try {
      const creado = await catalogosApi.create(catalogo, { nombre });
      await reload();
      toast(`${label} agregada`);
      return creado;
    } catch (err) {
      toast(err?.response?.data?.detail || `No se pudo agregar la ${label.toLowerCase()}`, "danger");
      return null;
    }
  };

  const submit = () => {
    if (!form.especie_id) {
      toast("Selecciona una especie", "danger");
      return;
    }
    onSave(form, mode, cultivo?.id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Editar cultivo" : "Registrar cultivo"}
      subtitle="Registra los datos fenológicos y de campaña"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="check" onClick={submit}>
            {isEdit ? "Guardar cambios" : "Registrar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-[18px]">
        <Field label="Foto del cultivo">
          <ImageUpload
            key={cultivo?.id || "new"}
            defaultUrl={cultivo?.imagen || ""}
            height={160}
            onChange={(url) => setForm((f) => ({ ...f, foto: url }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-[18px]">
          <Field label="Especie">
            <CatalogoSelect
              value={form.especie_id}
              onChange={setVal("especie_id")}
              options={especies}
              placeholder="Selecciona…"
              onAdd={addCatalogo("especies", onReloadEspecies, "Especie")}
            />
          </Field>
          <Field label="Variedad (opcional)">
            <Input value={form.variedad} onChange={set("variedad")} placeholder="Ej: Red Pearl" />
          </Field>

          <Field label="Biohuerto">
            <Select value={form.biohuerto_id} onChange={set("biohuerto_id")}>
              <option value="">Selecciona…</option>
              {biohuertos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Etapa actual">
            <Select value={form.etapa_id} onChange={set("etapa_id")}>
              <option value="">Selecciona…</option>
              {etapasCat.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Unidad de cantidad">
            <CatalogoSelect
              value={form.unidad_id}
              onChange={setVal("unidad_id")}
              options={unidades}
              placeholder="Selecciona…"
              onAdd={addCatalogo("unidades", onReloadUnidades, "Unidad")}
            />
          </Field>
          <Field label="Campaña (opcional)">
            <Select value={form.campania_id} onChange={set("campania_id")}>
              <option value="">Sin campaña</option>
              {campanias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Fecha de siembra">
            <Input type="date" value={form.fecha_siembra} onChange={set("fecha_siembra")} />
          </Field>
          <Field label="Fecha estimada de cosecha">
            <Input
              type="date"
              value={form.fecha_estimada_cosecha}
              onChange={set("fecha_estimada_cosecha")}
            />
          </Field>

          <Field label="Cantidad sembrada">
            <Input type="number" value={form.cantidad} onChange={set("cantidad")} placeholder="0" />
          </Field>
          <Field label="Área sembrada (m²)">
            <Input type="number" value={form.area_m2} onChange={set("area_m2")} placeholder="0" />
          </Field>

          <Field label="Notas (opcional)" className="col-span-2">
            <Input value={form.notas} onChange={set("notas")} placeholder="Observaciones del cultivo" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Modal Detalles (solo lectura) ---------------- */
function ReadField({ label, value, full }) {
  return (
    <Field label={label} className={full ? "col-span-2" : ""}>
      <div className="min-h-[46px] rounded-xl border border-line bg-chip px-[14px] py-3 text-[15px] text-text [overflow-wrap:anywhere]">
        {value ?? "—"}
      </div>
    </Field>
  );
}

function CultivoDetalleModal({ cultivo, onClose }) {
  const c = cultivo;
  if (!c) return null;
  const fmt = (v) => (v ? fmtFecha(v) : "—");
  const txt = (v) => (v != null && v !== "" ? v : "—");
  const etapa = ETAPAS[c.etapa]?.label || c.etapa_nombre || c.etapa || "—";
  const cantidad = c.cantidad != null ? `${c.cantidad} ${c.unidad || "und"}`.trim() : "—";
  const area = c.area_m2 != null ? `${c.area_m2} m²` : "—";

  return (
    <Modal
      open={!!c}
      onClose={onClose}
      title="Detalles del cultivo"
      subtitle="Información registrada (solo lectura)"
    >
      <div className="grid gap-[18px]">
        {c.imagen && (
          <img
            src={c.imagen}
            alt={c.especie || "cultivo"}
            className="h-[160px] w-full rounded-xl border border-line object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <div className="grid grid-cols-2 gap-[18px]">
          <ReadField label="Especie" value={txt(c.especie)} />
          <ReadField label="Variedad" value={txt(c.variedad)} />
          <ReadField label="Biohuerto" value={txt(c.biohuerto_nombre)} />
          <ReadField label="Etapa actual" value={etapa} />
          <ReadField label="Fecha de siembra" value={fmt(c.fecha_siembra)} />
          <ReadField label="Fecha estimada de cosecha" value={fmt(c.fecha_estimada_cosecha)} />
          <ReadField label="Cantidad sembrada" value={cantidad} />
          <ReadField label="Área sembrada" value={area} />
          <ReadField label="Campaña" value={txt(c.campania)} />
          <ReadField label="Estado" value={c.is_active === false ? "Baja" : "Activo"} />
          {c.notas ? <ReadField label="Notas" value={c.notas} full /> : null}
        </div>
      </div>
    </Modal>
  );
}
