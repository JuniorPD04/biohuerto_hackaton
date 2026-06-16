import { useEffect, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  IconBtn,
  Field,
  Textarea,
  Select,
  Modal,
  SeveridadBadge,
  EstadoIncidenciaBadge,
} from "../components/ui/primitives.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import { fmtFecha } from "../lib/theme.js";
import {
  incidenciasApi,
  biohuertosApi,
  cultivosApi,
  catalogosApi,
} from "../lib/resources.js";
import { useToast } from "../components/ui/Toast.jsx";
import { useConfirm, eliminarDialog } from "../components/ui/Confirm.jsx";

const asList = (data) => (Array.isArray(data) ? data : data?.items || []);

const SEVERIDADES = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
];
const ESTADOS = [
  { value: "abierta", label: "Abierta" },
  { value: "en_revision", label: "En revisión" },
  { value: "cerrada", label: "Cerrada" },
];

const EMPTY_FORM = {
  cultivo_id: "",
  tipo: "",
  descripcion: "",
  severidad: "media",
  zona_id: "",
  estado: "abierta",
};

function IncidenciaModal({ open, mode, row, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cultivos, setCultivos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [zonas, setZonas] = useState([]);

  // Cargar catálogos al abrir en modo creación/edición.
  useEffect(() => {
    if (!open || mode === "view") return;
    let cancel = false;
    (async () => {
      try {
        const [cul, tip, zon] = await Promise.all([
          cultivosApi.list(),
          catalogosApi.list("tipos-incidencia"),
          catalogosApi.list("zonas-planta"),
        ]);
        if (cancel) return;
        setCultivos(asList(cul));
        setTipos(asList(tip));
        setZonas(asList(zon));
      } catch {
        /* los selects quedan vacíos; se maneja con toast en el submit */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    if ((mode === "edit" || mode === "view") && row) {
      setForm({
        cultivo_id: row.cultivo_id ?? "",
        tipo: row.tipo || "",
        descripcion: row.descripcion || "",
        severidad: row.severidad || "media",
        zona_id: row.zona_id ?? "",
        estado: row.estado || "abierta",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, mode, row]);

  if (!open) return null;
  const view = mode === "view";
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setSaving(true);
    try {
      const body =
        mode === "edit"
          ? {
              estado: form.estado,
              severidad: form.severidad,
              descripcion: form.descripcion,
              zona_id: form.zona_id === "" ? null : form.zona_id,
            }
          : {
              cultivo_id: form.cultivo_id,
              tipo: form.tipo,
              descripcion: form.descripcion,
              severidad: form.severidad,
              zona_id: form.zona_id === "" ? null : form.zona_id,
              estado: form.estado,
            };
      await onSave(body, mode, row?.id);
    } finally {
      setSaving(false);
    }
  };

  if (view) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        width={520}
        title={row?.tipo || "Incidencia"}
        subtitle={`${row?.cultivo || "—"} · ${row?.biohuerto || "—"}`}
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Cultivo" value={row?.cultivo} />
            <Stat label="Biohuerto" value={row?.biohuerto} />
            <Stat label="Tipo" value={row?.tipo} />
            <Stat label="Zona afectada" value={row?.zona_afectada || "—"} />
            <Stat label="Severidad" value={<SeveridadBadge severidad={row?.severidad} />} />
            <Stat label="Estado" value={<EstadoIncidenciaBadge estado={row?.estado} />} />
            <Stat label="Reportado" value={fmtFecha(row?.reportado_en)} />
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
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title={mode === "edit" ? "Editar incidencia" : "Reportar incidencia"}
      subtitle="Registro de problemas detectados en el cultivo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={saving || (mode === "new" && (!form.cultivo_id || !form.tipo))}
          >
            {saving ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Reportar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-[18px]">
        {mode === "new" && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Cultivo">
              <Select value={form.cultivo_id} onChange={set("cultivo_id")}>
                <option value="">Selecciona un cultivo</option>
                {cultivos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.especie || c.nombre} {c.codigo ? `· ${c.codigo}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de incidencia">
              <Select value={form.tipo} onChange={set("tipo")}>
                <option value="">Selecciona un tipo</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.nombre}>
                    {t.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Severidad">
            <Select value={form.severidad} onChange={set("severidad")}>
              {SEVERIDADES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={form.estado} onChange={set("estado")}>
              {ESTADOS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Zona afectada">
          <Select value={form.zona_id} onChange={set("zona_id")}>
            <option value="">Sin zona específica</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descripción">
          <Textarea
            value={form.descripcion}
            onChange={set("descripcion")}
            placeholder="Describe la incidencia detectada…"
          />
        </Field>
      </div>
    </Modal>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-[14px]">
      <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted-2">
        {label}
      </div>
      <div className="mt-[5px] text-[15px] font-extrabold text-text">{value ?? "—"}</div>
    </div>
  );
}

export default function Incidencias() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [biohuertos, setBiohuertos] = useState([]);
  const [biohuertoId, setBiohuertoId] = useState("");
  const [estado, setEstado] = useState("");
  const [modal, setModal] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setBiohuertos(asList(await biohuertosApi.list()));
      } catch {
        /* filtro queda vacío */
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (biohuertoId) params.biohuerto_id = biohuertoId;
      if (estado) params.estado = estado;
      setRows(asList(await incidenciasApi.list(params)));
    } catch {
      toast("No se pudieron cargar las incidencias", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [biohuertoId, estado]);

  const handleSave = async (body, mode, id) => {
    try {
      if (mode === "edit") {
        await incidenciasApi.update(id, body);
        toast("Incidencia actualizada");
      } else {
        await incidenciasApi.create(body);
        toast("Incidencia reportada");
      }
      setModal(null);
      await load();
    } catch {
      toast(
        mode === "edit"
          ? "No se pudo actualizar la incidencia"
          : "No se pudo reportar la incidencia",
        "danger",
      );
    }
  };

  const handleDelete = async (row) => {
    const ok = await confirm(eliminarDialog(`la incidencia de ${row.cultivo || "cultivo"}`));
    if (!ok) return;
    try {
      await incidenciasApi.remove(row.id);
      toast("Incidencia eliminada");
      await load();
    } catch {
      toast("No se pudo eliminar la incidencia", "danger");
    }
  };

  const columns = [
    {
      key: "cultivo",
      label: "Cultivo",
      width: "1.2fr",
      render: (r) => (
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-extrabold text-text">
          {r.cultivo || "—"}
        </span>
      ),
    },
    { key: "biohuerto", label: "Biohuerto", width: "1.2fr" },
    { key: "tipo", label: "Tipo", width: "1fr" },
    {
      key: "severidad",
      label: "Severidad",
      width: ".9fr",
      render: (r) => <SeveridadBadge severidad={r.severidad} />,
    },
    { key: "zona_afectada", label: "Zona", width: "1fr" },
    {
      key: "estado",
      label: "Estado",
      width: "1fr",
      render: (r) => <EstadoIncidenciaBadge estado={r.estado} />,
    },
    {
      key: "reportado_en",
      label: "Fecha",
      width: ".9fr",
      render: (r) => (
        <span className="whitespace-nowrap text-muted-1">{fmtFecha(r.reportado_en)}</span>
      ),
    },
  ];

  return (
    <div className="animate-fade">
      <PageHeader
        title="Incidencias"
        subtitle="Seguimiento de problemas reportados en los cultivos."
        action={
          <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
            Reportar incidencia
          </Button>
        }
      />

      <Card
        pad="p-5"
        className="mb-6"
        style={{ background: "var(--chip-2)", border: "1px solid var(--line)" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Biohuerto" className="flex-1">
            <Select value={biohuertoId} onChange={(e) => setBiohuertoId(e.target.value)}>
              <option value="">Todos los biohuertos</option>
              {biohuertos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado" className="sm:w-[240px]">
            <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        empty={{
          icon: "alertTri",
          title: "No hay incidencias",
          desc: "No se encontraron incidencias con los filtros seleccionados.",
        }}
        rowActions={(r) => (
          <>
            <IconBtn name="eye" title="Ver detalle" onClick={() => setModal({ mode: "view", row: r })} />
            <IconBtn name="edit" title="Modificar" onClick={() => setModal({ mode: "edit", row: r })} />
            <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => handleDelete(r)} />
          </>
        )}
      />

      {!loading && rows.length > 0 && (
        <div className="mt-7 border-t border-line pt-[22px] text-sm text-muted-2">
          Mostrando {rows.length} incidencia{rows.length === 1 ? "" : "s"}
        </div>
      )}

      <IncidenciaModal
        open={!!modal}
        mode={modal?.mode}
        row={modal?.row}
        onClose={() => setModal(null)}
        onSave={handleSave}
      />
    </div>
  );
}
