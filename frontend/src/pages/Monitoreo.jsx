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
  Badge,
} from "../components/ui/primitives.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import { fmtFecha } from "../lib/theme.js";
import { monitoreoApi, biohuertosApi, cultivosApi } from "../lib/resources.js";
import { useToast } from "../components/ui/Toast.jsx";

const asList = (data) => (Array.isArray(data) ? data : data?.items || []);

const FUENTES = [
  { value: "manual", label: "Manual" },
  { value: "iot", label: "IoT" },
];

const FuenteBadge = ({ fuente }) =>
  fuente === "iot" ? (
    <Badge bg="#d6e8f0" fg="#1f5a7a" dot="#3f8ab0">
      IoT
    </Badge>
  ) : (
    <Badge bg="#eef2ec" fg="#5a625a" dot="#9aa39a">
      Manual
    </Badge>
  );

const num = (v, suffix = "") => (v == null || v === "" ? "—" : `${v}${suffix}`);

const EMPTY_FORM = {
  cultivo_id: "",
  fuente: "manual",
  humedad_pct: "",
  temperatura_c: "",
  luminosidad_lux: "",
  ph_suelo: "",
  observacion: "",
};

function MonitoreoModal({ open, mode, row, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cultivos, setCultivos] = useState([]);

  useEffect(() => {
    if (!open || mode !== "new") return;
    let cancel = false;
    (async () => {
      try {
        const data = await cultivosApi.list();
        if (!cancel) setCultivos(asList(data));
      } catch {
        if (!cancel) setCultivos([]);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, mode]);

  useEffect(() => {
    if (open && mode === "new") setForm(EMPTY_FORM);
  }, [open, mode]);

  if (!open) return null;
  const view = mode === "view";
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toNum = (v) => (v === "" ? null : Number(v));

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        cultivo_id: form.cultivo_id,
        fuente: form.fuente,
        humedad_pct: toNum(form.humedad_pct),
        temperatura_c: toNum(form.temperatura_c),
        luminosidad_lux: toNum(form.luminosidad_lux),
        ph_suelo: toNum(form.ph_suelo),
        observacion: form.observacion,
      });
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
        title="Registro de monitoreo"
        subtitle={`${row?.cultivo || "—"} · ${row?.biohuerto || "—"}`}
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Cultivo" value={row?.cultivo} />
            <Stat label="Biohuerto" value={row?.biohuerto} />
            <Stat label="Fuente" value={<FuenteBadge fuente={row?.fuente} />} />
            <Stat label="Registrado" value={fmtFecha(row?.registrado_en)} />
            <Stat label="Humedad" value={num(row?.humedad_pct, " %")} />
            <Stat label="Temperatura" value={num(row?.temperatura_c, " °C")} />
            <Stat label="Luminosidad" value={num(row?.luminosidad_lux, " lux")} />
            <Stat label="pH del suelo" value={num(row?.ph_suelo)} />
          </div>
          <div className="rounded-xl border border-line bg-white px-4 py-[14px]">
            <div className="text-[11.5px] font-extrabold uppercase tracking-[.05em] text-muted-2">
              Observación
            </div>
            <div className="mt-[6px] text-[14.5px] leading-[1.5] text-text">
              {row?.observacion || "Sin observaciones"}
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
      title="Registrar monitoreo"
      subtitle="Lectura ambiental del cultivo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !form.cultivo_id}>
            {saving ? "Guardando…" : "Registrar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-[18px]">
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
          <Field label="Fuente">
            <Select value={form.fuente} onChange={set("fuente")}>
              {FUENTES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Humedad (%)">
            <Input type="number" value={form.humedad_pct} onChange={set("humedad_pct")} placeholder="0" />
          </Field>
          <Field label="Temperatura (°C)">
            <Input type="number" value={form.temperatura_c} onChange={set("temperatura_c")} placeholder="0" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Luminosidad (lux)">
            <Input
              type="number"
              value={form.luminosidad_lux}
              onChange={set("luminosidad_lux")}
              placeholder="0"
            />
          </Field>
          <Field label="pH del suelo">
            <Input type="number" step="0.1" value={form.ph_suelo} onChange={set("ph_suelo")} placeholder="0" />
          </Field>
        </div>
        <Field label="Observación">
          <Textarea
            value={form.observacion}
            onChange={set("observacion")}
            placeholder="Notas de la lectura…"
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

export default function Monitoreo() {
  const toast = useToast();
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
      setRows(asList(await monitoreoApi.list(params)));
    } catch {
      toast("No se pudieron cargar los registros de monitoreo", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [biohuertoId]);

  const handleSave = async (body) => {
    try {
      await monitoreoApi.create(body);
      toast("Monitoreo registrado");
      setModal(null);
      await load();
    } catch {
      toast("No se pudo registrar el monitoreo", "danger");
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
    { key: "biohuerto", label: "Biohuerto", width: "1.3fr" },
    {
      key: "fuente",
      label: "Fuente",
      width: ".8fr",
      render: (r) => <FuenteBadge fuente={r.fuente} />,
    },
    {
      key: "humedad_pct",
      label: "Humedad",
      width: ".8fr",
      render: (r) => num(r.humedad_pct, " %"),
    },
    {
      key: "temperatura_c",
      label: "Temp.",
      width: ".8fr",
      render: (r) => num(r.temperatura_c, " °C"),
    },
    {
      key: "ph_suelo",
      label: "pH",
      width: ".6fr",
      render: (r) => num(r.ph_suelo),
    },
    {
      key: "registrado_en",
      label: "Fecha",
      width: ".9fr",
      render: (r) => (
        <span className="whitespace-nowrap text-muted-1">{fmtFecha(r.registrado_en)}</span>
      ),
    },
  ];

  return (
    <div className="animate-fade">
      <PageHeader
        title="Monitoreo ambiental"
        subtitle="Lecturas de humedad, temperatura, luz y pH de los cultivos."
        action={
          <Button icon="plus" onClick={() => setModal({ mode: "new" })}>
            Registrar monitoreo
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
          icon: "activity",
          title: "No hay registros de monitoreo",
          desc: "No se encontraron lecturas para el biohuerto seleccionado.",
        }}
        rowActions={(r) => (
          <IconBtn name="eye" title="Ver detalle" onClick={() => setModal({ mode: "view", row: r })} />
        )}
      />

      {!loading && rows.length > 0 && (
        <div className="mt-7 border-t border-line pt-[22px] text-sm text-muted-2">
          Mostrando {rows.length} registro{rows.length === 1 ? "" : "s"} de monitoreo
        </div>
      )}

      <MonitoreoModal
        open={!!modal}
        mode={modal?.mode}
        row={modal?.row}
        onClose={() => setModal(null)}
        onSave={handleSave}
      />
    </div>
  );
}
