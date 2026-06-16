import { useEffect, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  IconBtn,
  Field,
  Input,
  SearchInput,
  Modal,
  EstadoBadge,
  Toggle,
} from "../components/ui/primitives.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import { fmtFecha } from "../lib/theme.js";
import { campaniasApi } from "../lib/resources.js";
import { useToast } from "../components/ui/Toast.jsx";
import { useConfirm, eliminarDialog } from "../components/ui/Confirm.jsx";

const EMPTY_FORM = {
  nombre: "",
  fecha_inicio: "",
  fecha_fin: "",
  is_active: true,
};

// Normaliza una fecha ISO (o con hora) al formato yyyy-mm-dd que usan los <input type=date>.
const toDateInput = (v) => (v ? String(v).split("T")[0].split(" ")[0] : "");

function CampaniaModal({ open, mode, row, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && row) {
      setForm({
        nombre: row.nombre || "",
        fecha_inicio: toDateInput(row.fecha_inicio),
        fecha_fin: toDateInput(row.fecha_fin),
        is_active: !!row.is_active,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, mode, row]);

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(
        {
          nombre: form.nombre,
          fecha_inicio: form.fecha_inicio || null,
          fecha_fin: form.fecha_fin || null,
          is_active: form.is_active,
        },
        mode,
        row?.id,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title={mode === "edit" ? "Editar campaña" : "Registrar campaña"}
      subtitle="Periodo productivo del biohuerto"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !form.nombre.trim()}>
            {saving ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Registrar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-[18px]">
        <Field label="Nombre">
          <Input
            value={form.nombre}
            onChange={set("nombre")}
            placeholder="Ej: Campaña verano 2026"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fecha de inicio">
            <Input type="date" value={form.fecha_inicio} onChange={set("fecha_inicio")} />
          </Field>
          <Field label="Fecha de fin">
            <Input type="date" value={form.fecha_fin} onChange={set("fecha_fin")} />
          </Field>
        </div>
        <Field label="Estado">
          <div className="flex items-center gap-3">
            <Toggle
              on={form.is_active}
              title={form.is_active ? "Activa" : "Inactiva"}
              onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
            />
            <span className="text-sm font-bold text-muted-1">
              {form.is_active ? "Activa" : "Inactiva"}
            </span>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

export default function Campanias() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // { mode, row }

  const load = async () => {
    setLoading(true);
    try {
      const data = await campaniasApi.list();
      setRows(Array.isArray(data) ? data : data?.items || []);
    } catch {
      toast("No se pudieron cargar las campañas", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter(
    (c) => !q || (c.nombre || "").toLowerCase().includes(q.toLowerCase()),
  );

  const handleSave = async (body, mode, id) => {
    try {
      if (mode === "edit") {
        await campaniasApi.update(id, body);
        toast("Campaña actualizada");
      } else {
        await campaniasApi.create(body);
        toast("Campaña creada");
      }
      setModal(null);
      await load();
    } catch {
      toast(
        mode === "edit" ? "No se pudo actualizar la campaña" : "No se pudo crear la campaña",
        "danger",
      );
    }
  };

  const handleDelete = async (row) => {
    const ok = await confirm(eliminarDialog(row.nombre));
    if (!ok) return;
    try {
      await campaniasApi.remove(row.id);
      toast("Campaña eliminada");
      await load();
    } catch {
      toast("No se pudo eliminar la campaña", "danger");
    }
  };

  const columns = [
    {
      key: "nombre",
      label: "Campaña",
      width: "1.6fr",
      render: (c) => (
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[15.5px] font-extrabold text-text">
          {c.nombre}
        </span>
      ),
    },
    {
      key: "fechas",
      label: "Periodo",
      width: "1.4fr",
      render: (c) => (
        <span className="whitespace-nowrap text-muted-1">
          {fmtFecha(c.fecha_inicio)} — {fmtFecha(c.fecha_fin)}
        </span>
      ),
    },
    {
      key: "is_active",
      label: "Estado",
      width: ".8fr",
      render: (c) => <EstadoBadge activo={!!c.is_active} />,
    },
    {
      key: "cultivos_count",
      label: "Cultivos",
      width: ".7fr",
      render: (c) => (
        <span
          className="grid h-[26px] min-w-[30px] place-items-center rounded-lg px-[9px] text-[14px] font-extrabold text-primary"
          style={{ background: "var(--accent-50)", display: "inline-grid" }}
        >
          {c.cultivos_count ?? 0}
        </span>
      ),
    },
  ];

  return (
    <div className="animate-fade">
      <PageHeader
        title="Campañas productivas"
        subtitle="Administra los periodos de siembra y cosecha de los biohuertos."
        action={
          <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
            Nueva campaña
          </Button>
        }
      />

      <Card
        pad="p-5"
        className="mb-6"
        style={{ background: "var(--chip-2)", border: "1px solid var(--line)" }}
      >
        <Field label="Buscar por nombre">
          <SearchInput
            placeholder="Buscar campaña…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
      </Card>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={loading}
        empty={{
          icon: "calendar",
          title: "No hay campañas",
          desc: q
            ? "Ninguna campaña coincide con tu búsqueda."
            : "Aún no se han registrado campañas.",
          action: !q && (
            <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
              Nueva campaña
            </Button>
          ),
        }}
        rowActions={(c) => (
          <>
            <IconBtn name="edit" title="Modificar" onClick={() => setModal({ mode: "edit", row: c })} />
            <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => handleDelete(c)} />
          </>
        )}
      />

      {!loading && filtered.length > 0 && (
        <div className="mt-7 border-t border-line pt-[22px] text-sm text-muted-2">
          Mostrando {filtered.length} de {rows.length} campañas registradas
        </div>
      )}

      <CampaniaModal
        open={!!modal}
        mode={modal?.mode}
        row={modal?.row}
        onClose={() => setModal(null)}
        onSave={handleSave}
      />
    </div>
  );
}
