import { useEffect, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  IconBtn,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  EstadoBadge,
} from "../components/ui/primitives.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import { fmtFecha } from "../lib/theme.js";
import {
  cuidadosApi,
  biohuertosApi,
  cultivosApi,
  catalogosApi,
} from "../lib/resources.js";
import { useToast } from "../components/ui/Toast.jsx";
import { useConfirm, eliminarDialog } from "../components/ui/Confirm.jsx";

const asList = (data) => (Array.isArray(data) ? data : data?.items || []);

const EMPTY_FORM = {
  cultivo_id: "",
  tipo_id: "",
  descripcion: "",
  frecuencia_dias: "",
};

function CuidadoModal({ open, mode, row, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cultivos, setCultivos] = useState([]);
  const [tipos, setTipos] = useState([]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      try {
        const [cul, tip] = await Promise.all([
          cultivosApi.list(),
          catalogosApi.list("tipos-alerta"),
        ]);
        if (cancel) return;
        setCultivos(asList(cul));
        setTipos(asList(tip));
      } catch {
        /* selects quedan vacíos */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && row) {
      setForm({
        cultivo_id: row.cultivo_id ?? "",
        tipo_id: row.tipo_id ?? "",
        descripcion: row.descripcion || "",
        frecuencia_dias: row.frecuencia_dias ?? "",
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
      const body = {
        cultivo_id: form.cultivo_id,
        tipo_id: form.tipo_id === "" ? null : form.tipo_id,
        descripcion: form.descripcion,
        frecuencia_dias: form.frecuencia_dias === "" ? null : Number(form.frecuencia_dias),
      };
      await onSave(body, mode, row?.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      title={mode === "edit" ? "Editar cuidado" : "Programar cuidado"}
      subtitle="Tarea recurrente de mantenimiento del cultivo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !form.cultivo_id}>
            {saving ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Programar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-[18px]">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cultivo">
            <Select value={form.cultivo_id} onChange={set("cultivo_id")} disabled={mode === "edit"}>
              <option value="">Selecciona un cultivo</option>
              {cultivos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.especie || c.nombre} {c.codigo ? `· ${c.codigo}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo de cuidado">
            <Select value={form.tipo_id} onChange={set("tipo_id")}>
              <option value="">Selecciona un tipo</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Frecuencia (días)">
          <Input
            type="number"
            value={form.frecuencia_dias}
            onChange={set("frecuencia_dias")}
            placeholder="Ej: 7"
          />
        </Field>
        <Field label="Descripción">
          <Textarea
            value={form.descripcion}
            onChange={set("descripcion")}
            placeholder="Detalle de la tarea de cuidado…"
          />
        </Field>
      </div>
    </Modal>
  );
}

export default function Cuidados() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [biohuertos, setBiohuertos] = useState([]);
  const [biohuertoId, setBiohuertoId] = useState("");
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
      const params = biohuertoId ? { biohuerto_id: biohuertoId } : {};
      setRows(asList(await cuidadosApi.list(params)));
    } catch {
      toast("No se pudieron cargar los cuidados", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [biohuertoId]);

  const handleSave = async (body, mode, id) => {
    try {
      if (mode === "edit") {
        await cuidadosApi.update(id, body);
        toast("Cuidado actualizado");
      } else {
        await cuidadosApi.create(body);
        toast("Cuidado programado");
      }
      setModal(null);
      await load();
    } catch {
      toast(
        mode === "edit" ? "No se pudo actualizar el cuidado" : "No se pudo programar el cuidado",
        "danger",
      );
    }
  };

  const handleDelete = async (row) => {
    const ok = await confirm(eliminarDialog(`el cuidado de ${row.cultivo || "cultivo"}`));
    if (!ok) return;
    try {
      await cuidadosApi.remove(row.id);
      toast("Cuidado eliminado");
      await load();
    } catch {
      toast("No se pudo eliminar el cuidado", "danger");
    }
  };

  const handleMarcar = async (row) => {
    try {
      await cuidadosApi.marcarRealizado(row.id);
      toast("Cuidado marcado como realizado");
      await load();
    } catch {
      toast("No se pudo marcar el cuidado", "danger");
    }
  };

  const columns = [
    {
      key: "cultivo",
      label: "Cultivo",
      width: "1.3fr",
      render: (r) => (
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap font-extrabold text-text">
          {r.cultivo || "—"}
        </span>
      ),
    },
    { key: "biohuerto", label: "Biohuerto", width: "1.2fr" },
    { key: "tipo", label: "Tipo", width: "1fr" },
    {
      key: "frecuencia_dias",
      label: "Frecuencia",
      width: ".9fr",
      render: (r) => (r.frecuencia_dias != null ? `Cada ${r.frecuencia_dias} d` : "—"),
    },
    {
      key: "ultima_realizada",
      label: "Última",
      width: ".9fr",
      render: (r) => (
        <span className="whitespace-nowrap text-muted-1">{fmtFecha(r.ultima_realizada)}</span>
      ),
    },
    {
      key: "activo",
      label: "Estado",
      width: ".7fr",
      render: (r) => <EstadoBadge activo={!!r.activo} />,
    },
  ];

  return (
    <div className="animate-fade">
      <PageHeader
        title="Cuidados programados"
        subtitle="Tareas recurrentes de mantenimiento de los cultivos."
        action={
          <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
            Programar cuidado
          </Button>
        }
      />

      <Card
        pad="p-5"
        className="mb-6"
        style={{ background: "var(--chip-2)", border: "1px solid var(--line)" }}
      >
        <Field label="Biohuerto">
          <Select value={biohuertoId} onChange={(e) => setBiohuertoId(e.target.value)}>
            <option value="">Todos los biohuertos</option>
            {biohuertos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        empty={{
          icon: "drop",
          title: "No hay cuidados programados",
          desc: "No se encontraron tareas de cuidado para el biohuerto seleccionado.",
          action: (
            <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
              Programar cuidado
            </Button>
          ),
        }}
        rowActions={(r) => (
          <>
            <IconBtn name="check" title="Marcar realizado" tone="primary" onClick={() => handleMarcar(r)} />
            <IconBtn name="edit" title="Modificar" onClick={() => setModal({ mode: "edit", row: r })} />
            <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => handleDelete(r)} />
          </>
        )}
      />

      {!loading && rows.length > 0 && (
        <div className="mt-7 border-t border-line pt-[22px] text-sm text-muted-2">
          Mostrando {rows.length} cuidado{rows.length === 1 ? "" : "s"} programado
          {rows.length === 1 ? "" : "s"}
        </div>
      )}

      <CuidadoModal
        open={!!modal}
        mode={modal?.mode}
        row={modal?.row}
        onClose={() => setModal(null)}
        onSave={handleSave}
      />
    </div>
  );
}
