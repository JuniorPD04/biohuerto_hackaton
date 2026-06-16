import { useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  IconBtn,
  Field,
  Input,
  Select,
  Toggle,
  Badge,
  SearchInput,
  Modal,
  Icon,
} from "../components/ui/primitives.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import { entidadesApi } from "../lib/resources.js";
import { useToast } from "../components/ui/Toast.jsx";
import { useConfirm, eliminarDialog } from "../components/ui/Confirm.jsx";

/* ---- helpers de columna / campo ---- */
const colMono = (key, label) => ({ key, label, type: "mono", width: ".9fr" });
const ORIGEN = { key: "es_sistema", label: "Origen", type: "origen", width: ".8fr" };
const f = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });

/* Configuración por catálogo: columnas visibles + campos del formulario. */
const ENTIDADES = {
  etapas: {
    columns: [
      colMono("codigo", "Código"),
      { key: "nombre", label: "Nombre", type: "etapa" },
      { key: "orden", label: "Orden", type: "num", width: ".5fr" },
      { key: "color_bg", label: "Color fondo", type: "swatch" },
      { key: "color_fg", label: "Color texto", type: "swatch" },
    ],
    fields: [
      f("codigo", "Código", "text", { lockedEdit: true }),
      f("nombre", "Nombre", "text"),
      f("orden", "Orden", "number"),
      f("color_bg", "Color de fondo", "color"),
      f("color_fg", "Color de texto", "color"),
    ],
    isActive: false,
  },
  especies: {
    columns: [
      { key: "nombre", label: "Nombre", type: "strong" },
      { key: "nombre_cientifico", label: "Nombre científico", type: "italic" },
      ORIGEN,
    ],
    fields: [f("nombre", "Nombre", "text"), f("nombre_cientifico", "Nombre científico", "text")],
    isActive: true,
  },
  "tipos-incidencia": {
    columns: [{ key: "nombre", label: "Nombre", type: "strong" }],
    fields: [f("nombre", "Nombre", "text")],
    isActive: false,
  },
  "categorias-practica": {
    columns: [
      { key: "nombre", label: "Nombre", type: "strong" },
      { key: "es_sostenible", label: "Sostenible", type: "bool" },
      { key: "sin_agroquimicos", label: "Sin agroquímicos", type: "bool" },
    ],
    fields: [
      f("nombre", "Nombre", "text"),
      f("es_sostenible", "Es sostenible", "bool"),
      f("sin_agroquimicos", "Sin agroquímicos", "bool"),
    ],
    isActive: false,
  },
  "tipos-practica": {
    columns: [
      { key: "categoria", label: "Categoría", type: "chip", width: ".9fr" },
      { key: "nombre", label: "Nombre", type: "strong" },
    ],
    fields: [
      f("categoria_id", "Categoría", "select", {
        optionsKey: "categorias-practica", optionValue: "id", optionLabel: "nombre",
      }),
      f("nombre", "Nombre", "text"),
    ],
    isActive: false,
  },
  "categorias-costo": {
    columns: [{ key: "nombre", label: "Nombre", type: "strong" }],
    fields: [f("nombre", "Nombre", "text")],
    isActive: false,
  },
  "tipos-alerta": {
    columns: [{ key: "nombre", label: "Nombre", type: "strong" }],
    fields: [f("nombre", "Nombre", "text")],
    isActive: false,
  },
  unidades: {
    columns: [colMono("codigo", "Código"), { key: "nombre", label: "Nombre", type: "strong" }, ORIGEN],
    fields: [f("codigo", "Código", "text"), f("nombre", "Nombre", "text")],
    isActive: true,
  },
  insumos: {
    columns: [{ key: "nombre", label: "Nombre", type: "strong" }, ORIGEN],
    fields: [f("nombre", "Nombre", "text")],
    isActive: true,
  },
  "zonas-planta": {
    columns: [{ key: "nombre", label: "Nombre", type: "strong" }, ORIGEN],
    fields: [f("nombre", "Nombre", "text")],
    isActive: true,
  },
  "tipos-area": {
    columns: [colMono("codigo", "Código"), { key: "nombre", label: "Nombre", type: "strong" }, ORIGEN],
    fields: [f("codigo", "Código", "text"), f("nombre", "Nombre", "text")],
    isActive: true,
  },
  "fuentes-monitoreo": {
    columns: [colMono("codigo", "Código"), { key: "nombre", label: "Nombre", type: "strong" }],
    fields: [f("codigo", "Código", "text", { lockedEdit: true }), f("nombre", "Nombre", "text")],
    isActive: false,
  },
  "factores-carbono": {
    columns: [
      colMono("codigo", "Código"),
      { key: "descripcion", label: "Descripción", type: "strong", width: "1.6fr" },
      { key: "valor", label: "Valor", type: "num", width: ".6fr" },
      { key: "unidad", label: "Unidad", type: "mono", width: ".8fr" },
      { key: "fuente", label: "Fuente", type: "italic" },
    ],
    fields: [
      f("codigo", "Código", "text", { lockedEdit: true }),
      f("descripcion", "Descripción", "text"),
      f("valor", "Valor", "number", { step: "0.000001" }),
      f("unidad", "Unidad", "text"),
      f("fuente", "Fuente", "text"),
    ],
    isActive: false,
  },
};

/* ---- render de celdas ---- */
function Cell({ col, row }) {
  const v = row[col.key];
  switch (col.type) {
    case "mono":
      return <span className="font-mono text-[13px] text-muted-1">{v ?? "—"}</span>;
    case "strong":
      return <span className="font-extrabold text-text">{v ?? "—"}</span>;
    case "italic":
      return <span className="italic text-muted-2">{v || "—"}</span>;
    case "num":
      return <span className="tabular-nums">{v ?? "—"}</span>;
    case "etapa":
      return (
        <Badge bg={row.color_bg || "#eef2ec"} fg={row.color_fg || "#5a625a"}>
          {v}
        </Badge>
      );
    case "chip":
      return <Badge bg="#eef2ec" fg="#46514a">{v || "—"}</Badge>;
    case "bool":
      return v ? (
        <span className="inline-grid h-6 w-6 place-items-center rounded-md bg-[#dcefd7] text-[#2f6b34]">
          <Icon name="check" size={14} stroke={2.6} />
        </span>
      ) : (
        <span className="text-muted-3">—</span>
      );
    case "swatch":
      return (
        <span className="inline-flex items-center gap-2">
          <span className="h-[18px] w-[18px] rounded-md border border-line" style={{ background: v }} />
          <span className="font-mono text-[12.5px] text-muted-2">{v || "—"}</span>
        </span>
      );
    case "origen":
      return v ? (
        <Badge bg="#eef2ec" fg="#6e786f">Sistema</Badge>
      ) : (
        <Badge bg="#e7eef9" fg="#2f6ba8">Personalizado</Badge>
      );
    default:
      return <span className="text-text">{v ?? "—"}</span>;
  }
}

/* ---- modal crear / editar / ver ---- */
function EntidadModal({ open, mode, cfg, label, row, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState({});
  const readonly = mode === "view";

  useEffect(() => {
    if (!open) return;
    const init = {};
    for (const fl of cfg.fields) {
      let val = row ? row[fl.key] : "";
      if (val == null) val = fl.type === "bool" ? false : "";
      if (mode === "new" && fl.type === "color") val = fl.key === "color_bg" ? "#dcefd7" : "#2f6b34";
      init[fl.key] = val;
    }
    setForm(init);
    // carga de opciones para selects
    const withOpts = cfg.fields.filter((fl) => fl.optionsKey);
    Promise.all(withOpts.map((fl) => entidadesApi.list(fl.optionsKey).then((d) => [fl.optionsKey, d])))
      .then((pairs) => setOptions(Object.fromEntries(pairs)))
      .catch(() => setOptions({}));
  }, [open, mode, row, cfg]);

  if (!open) return null;
  const set = (k, val) => setForm((s) => ({ ...s, [k]: val }));

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(form, mode, row?.id);
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "new" ? `Nuevo en ${label}` : mode === "view" ? "Detalle" : `Editar ${label}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{readonly ? "Cerrar" : "Cancelar"}</Button>
          {!readonly && (
            <Button onClick={submit} disabled={saving}>
              {saving ? "Guardando…" : mode === "new" ? "Crear" : "Guardar cambios"}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-[18px]">
        {cfg.fields.map((fl) => {
          const disabled = readonly || (mode === "edit" && fl.lockedEdit);
          if (fl.type === "bool") {
            return (
              <div key={fl.key} className="flex items-center justify-between rounded-xl border border-line bg-chip-3 px-4 py-3">
                <span className="text-[14px] font-bold text-text">{fl.label}</span>
                <Toggle on={!!form[fl.key]} onClick={() => !disabled && set(fl.key, !form[fl.key])} />
              </div>
            );
          }
          if (fl.type === "select") {
            const opts = options[fl.optionsKey] || [];
            return (
              <Field key={fl.key} label={fl.label}>
                <Select value={form[fl.key] ?? ""} disabled={disabled} onChange={(e) => set(fl.key, e.target.value)}>
                  <option value="">Selecciona…</option>
                  {opts.map((o) => (
                    <option key={o[fl.optionValue]} value={o[fl.optionValue]}>
                      {o[fl.optionLabel]}
                    </option>
                  ))}
                </Select>
              </Field>
            );
          }
          if (fl.type === "color") {
            return (
              <Field key={fl.key} label={fl.label}>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form[fl.key] || "#ffffff"}
                    disabled={disabled}
                    onChange={(e) => set(fl.key, e.target.value)}
                    className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-white p-1"
                  />
                  <Input value={form[fl.key] || ""} disabled={disabled} onChange={(e) => set(fl.key, e.target.value)} />
                </div>
              </Field>
            );
          }
          return (
            <Field key={fl.key} label={fl.label}>
              <Input
                type={fl.type === "number" ? "number" : "text"}
                step={fl.step}
                value={form[fl.key] ?? ""}
                disabled={disabled}
                onChange={(e) => set(fl.key, e.target.value)}
              />
            </Field>
          );
        })}
      </div>
    </Modal>
  );
}

export default function Entidades() {
  const toast = useToast();
  const confirm = useConfirm();
  const [meta, setMeta] = useState([]);
  const [sel, setSel] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);

  const cfg = sel ? ENTIDADES[sel.key] : null;

  const loadMeta = async () => {
    try {
      const m = await entidadesApi.meta();
      // Solo las entidades que tienen config de UI (set elegido).
      const filtered = m.filter((e) => ENTIDADES[e.key]);
      setMeta(filtered);
      setSel((prev) => prev || filtered[0] || null);
    } catch {
      toast("No se pudieron cargar las entidades", "danger");
    }
  };

  const loadRows = async (key) => {
    setLoading(true);
    try {
      setRows(await entidadesApi.list(key));
    } catch {
      toast("No se pudieron cargar los registros", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sel) {
      setSearch("");
      loadRows(sel.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.key]);

  const refresh = async () => {
    await loadRows(sel.key);
    await loadMeta();
  };

  const handleSave = async (form, mode, id) => {
    try {
      if (mode === "edit") {
        await entidadesApi.update(sel.key, id, form);
        toast("Registro actualizado");
      } else {
        await entidadesApi.create(sel.key, form);
        toast("Registro creado");
      }
      setModal(null);
      await refresh();
    } catch (e) {
      toast(e?.response?.data?.detail || "No se pudo guardar", "danger");
    }
  };

  const handleToggle = async (row) => {
    try {
      await entidadesApi.update(sel.key, row.id, { is_active: !row.is_active });
      await loadRows(sel.key);
    } catch {
      toast("No se pudo cambiar el estado", "danger");
    }
  };

  const handleDelete = async (row) => {
    const ok = await confirm(eliminarDialog(`"${row.nombre || row.codigo || "este registro"}"`));
    if (!ok) return;
    try {
      await entidadesApi.remove(sel.key, row.id);
      toast("Registro eliminado");
      await refresh();
    } catch (e) {
      toast(e?.response?.data?.detail || "No se pudo eliminar", "danger");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const columns = (cfg?.columns || []).map((c) => ({
    key: c.key,
    label: c.label,
    width: c.width,
    render: (row) => <Cell col={c} row={row} />,
  }));

  return (
    <div className="animate-fade">
      <PageHeader
        title="Entidades"
        subtitle="Catálogos fuente del sistema — gestiona los valores maestros que alimentan las demás vistas."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Rail de entidades */}
        <div>
          <div className="mb-3 px-1 text-[11.5px] font-extrabold uppercase tracking-[.08em] text-muted-3">
            Entidades fuente
          </div>
          <div className="grid gap-[10px]">
            {meta.map((e) => {
              const active = sel?.key === e.key;
              return (
                <button
                  key={e.key}
                  onClick={() => setSel(e)}
                  className={`flex items-center gap-3 rounded-[14px] border bg-surface px-4 py-[14px] text-left transition-all ${
                    active ? "border-primary shadow-cardHover" : "border-line hover:border-line-2"
                  }`}
                >
                  <span
                    className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px] ${
                      active ? "bg-primary text-white" : "bg-chip text-muted-2"
                    }`}
                  >
                    <Icon name={e.icon} size={20} stroke={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-extrabold text-text">{e.label}</div>
                    <div className="text-[12.5px] text-muted-2">{e.count} registros</div>
                  </div>
                  <Icon name="chevRight" size={18} className={active ? "text-primary" : "text-muted-3"} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel del catálogo seleccionado */}
        <div>
          {sel && (
            <>
              <Card pad="p-5" className="mb-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-[13px] bg-primary text-white">
                      <Icon name={sel.icon} size={24} stroke={1.9} />
                    </span>
                    <div>
                      <h2 className="m-0 text-[22px] font-extrabold text-text">{sel.label}</h2>
                      <p className="mt-1 max-w-[520px] text-[14px] text-muted-2">{sel.descripcion}</p>
                    </div>
                  </div>
                  <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
                    Agregar
                  </Button>
                </div>
                <div className="mt-4">
                  <SearchInput
                    placeholder="Buscar registro…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </Card>

              <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                empty={{
                  icon: sel.icon,
                  title: "Sin registros",
                  desc: "Aún no hay valores en este catálogo.",
                  action: (
                    <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
                      Agregar
                    </Button>
                  ),
                }}
                rowActions={(row) => (
                  <>
                    <IconBtn name="eye" title="Ver detalle" onClick={() => setModal({ mode: "view", row })} />
                    <IconBtn name="edit" title="Editar" onClick={() => setModal({ mode: "edit", row })} />
                    {cfg.isActive && (
                      <Toggle
                        on={!!row.is_active}
                        title={row.is_active ? "Dar de baja" : "Reactivar"}
                        onClick={() => handleToggle(row)}
                      />
                    )}
                    <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => handleDelete(row)} />
                  </>
                )}
              />

              {!loading && filtered.length > 0 && (
                <div className="mt-6 border-t border-line pt-4 text-sm text-muted-2">
                  Mostrando {filtered.length} de {rows.length} registro{rows.length === 1 ? "" : "s"}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {cfg && (
        <EntidadModal
          open={!!modal}
          mode={modal?.mode}
          cfg={cfg}
          label={sel?.label}
          row={modal?.row}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
