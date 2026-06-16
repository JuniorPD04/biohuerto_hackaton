import { useEffect, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  Badge,
  Tabs,
} from "../components/ui/primitives.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import { fmtFecha, fmtMoneda } from "../lib/theme.js";
import {
  trazabilidadApi,
  biohuertosApi,
  cultivosApi,
  catalogosApi,
} from "../lib/resources.js";
import { useToast } from "../components/ui/Toast.jsx";

const asList = (data) => (Array.isArray(data) ? data : data?.items || []);

/**
 * Select de catálogo con botón "+ Nuevo" para catálogos extensibles. Usa
 * window.prompt para pedir el nombre, crea vía catalogosApi.create, recarga el
 * catálogo y deja seleccionado el nuevo elemento.
 */
function CatalogSelect({ catalogo, items, value, onChange, onReload, placeholder, extensible }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const handleNuevo = async () => {
    const nombre = (window.prompt("Nombre del nuevo elemento:") || "").trim();
    if (!nombre) return;
    setBusy(true);
    try {
      const creado = await catalogosApi.create(catalogo, { nombre });
      const fresh = asList(await catalogosApi.list(catalogo));
      onReload(fresh);
      const nuevoId = creado?.id ?? fresh.find((x) => x.nombre === nombre)?.id ?? "";
      if (nuevoId) onChange(String(nuevoId));
      toast("Elemento agregado");
    } catch {
      toast("No se pudo crear el elemento", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="flex-1">
        <option value="">{placeholder || "Selecciona…"}</option>
        {items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.nombre}
          </option>
        ))}
      </Select>
      {extensible && (
        <Button variant="secondary" size="sm" icon="plus" onClick={handleNuevo} disabled={busy}>
          Nuevo
        </Button>
      )}
    </div>
  );
}

/* ============================ PRÁCTICAS ============================ */

const PRACTICA_FORM = {
  cultivo_id: "",
  tipo: "",
  descripcion: "",
  insumo_id: "",
  cantidad: "",
  unidad_id: "",
  fecha: "",
};

function PracticaModal({ open, onClose, onSave }) {
  const [form, setForm] = useState(PRACTICA_FORM);
  const [saving, setSaving] = useState(false);
  const [cultivos, setCultivos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [unidades, setUnidades] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm(PRACTICA_FORM);
    let cancel = false;
    (async () => {
      try {
        const [cul, tip, ins, uni] = await Promise.all([
          cultivosApi.list(),
          catalogosApi.list("tipos-practica"),
          catalogosApi.list("insumos"),
          catalogosApi.list("unidades"),
        ]);
        if (cancel) return;
        setCultivos(asList(cul));
        setTipos(asList(tip));
        setInsumos(asList(ins));
        setUnidades(asList(uni));
      } catch {
        /* selects vacíos */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open]);

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        cultivo_id: form.cultivo_id,
        tipo: form.tipo,
        descripcion: form.descripcion,
        insumo_id: form.insumo_id === "" ? null : form.insumo_id,
        cantidad: form.cantidad === "" ? null : Number(form.cantidad),
        unidad_id: form.unidad_id === "" ? null : form.unidad_id,
        fecha: form.fecha || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={580}
      title="Registrar práctica"
      subtitle="Labor agrícola aplicada al cultivo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !form.cultivo_id || !form.tipo}>
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
          <Field label="Tipo de práctica">
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
        <Field label="Insumo">
          <CatalogSelect
            catalogo="insumos"
            items={insumos}
            value={form.insumo_id}
            onChange={setVal("insumo_id")}
            onReload={setInsumos}
            placeholder="Sin insumo"
            extensible
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cantidad">
            <Input type="number" value={form.cantidad} onChange={set("cantidad")} placeholder="0" />
          </Field>
          <Field label="Unidad">
            <CatalogSelect
              catalogo="unidades"
              items={unidades}
              value={form.unidad_id}
              onChange={setVal("unidad_id")}
              onReload={setUnidades}
              placeholder="Sin unidad"
              extensible
            />
          </Field>
        </div>
        <Field label="Fecha">
          <Input type="date" value={form.fecha} onChange={set("fecha")} />
        </Field>
        <Field label="Descripción">
          <Textarea
            value={form.descripcion}
            onChange={set("descripcion")}
            placeholder="Detalle de la práctica…"
          />
        </Field>
      </div>
    </Modal>
  );
}

function PracticasTab({ biohuertoId }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = biohuertoId ? { biohuerto_id: biohuertoId } : {};
      setRows(asList(await trazabilidadApi.practicas(params)));
    } catch {
      toast("No se pudieron cargar las prácticas", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [biohuertoId]);

  const handleSave = async (body) => {
    try {
      await trazabilidadApi.crearPractica(body);
      toast("Práctica registrada");
      setOpen(false);
      await load();
    } catch {
      toast("No se pudo registrar la práctica", "danger");
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
    { key: "tipo", label: "Tipo", width: "1fr" },
    { key: "insumo", label: "Insumo", width: "1fr" },
    {
      key: "cantidad",
      label: "Cantidad",
      width: ".9fr",
      render: (r) =>
        r.cantidad != null ? `${r.cantidad} ${r.unidad || ""}`.trim() : "—",
    },
    {
      key: "sostenible",
      label: "Sostenible",
      width: ".8fr",
      render: (r) =>
        r.sostenible ? (
          <Badge bg="#dcefd7" fg="#2f6b34" dot="#5aa860">
            Sí
          </Badge>
        ) : (
          <Badge bg="#eef2ec" fg="#6e786f">
            No
          </Badge>
        ),
    },
    {
      key: "fecha",
      label: "Fecha",
      width: ".9fr",
      render: (r) => <span className="whitespace-nowrap text-muted-1">{fmtFecha(r.fecha)}</span>,
    },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon="plus" onClick={() => setOpen(true)}>
          Registrar práctica
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        empty={{
          icon: "recycle",
          title: "No hay prácticas",
          desc: "No se encontraron prácticas para el biohuerto seleccionado.",
        }}
      />
      {!loading && rows.length > 0 && (
        <div className="mt-7 border-t border-line pt-[22px] text-sm text-muted-2">
          Mostrando {rows.length} práctica{rows.length === 1 ? "" : "s"}
        </div>
      )}
      <PracticaModal open={open} onClose={() => setOpen(false)} onSave={handleSave} />
    </>
  );
}

/* ============================ COSTOS ============================ */

const COSTO_FORM = {
  cultivo_id: "",
  categoria: "",
  descripcion: "",
  cantidad: "",
  unidad_id: "",
  monto: "",
  moneda: "PEN",
  fecha: "",
};

function CostoModal({ open, onClose, onSave }) {
  const [form, setForm] = useState(COSTO_FORM);
  const [saving, setSaving] = useState(false);
  const [cultivos, setCultivos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [unidades, setUnidades] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm(COSTO_FORM);
    let cancel = false;
    (async () => {
      try {
        const [cul, cat, uni] = await Promise.all([
          cultivosApi.list(),
          catalogosApi.list("categorias-costo"),
          catalogosApi.list("unidades"),
        ]);
        if (cancel) return;
        setCultivos(asList(cul));
        setCategorias(asList(cat));
        setUnidades(asList(uni));
      } catch {
        /* selects vacíos */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open]);

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setVal = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await onSave({
        cultivo_id: form.cultivo_id,
        categoria: form.categoria,
        descripcion: form.descripcion,
        cantidad: form.cantidad === "" ? null : Number(form.cantidad),
        unidad_id: form.unidad_id === "" ? null : form.unidad_id,
        monto: form.monto === "" ? null : Number(form.monto),
        moneda: form.moneda,
        fecha: form.fecha || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={580}
      title="Registrar costo"
      subtitle="Gasto asociado al cultivo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !form.cultivo_id || !form.categoria}>
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
          <Field label="Categoría">
            <Select value={form.categoria} onChange={set("categoria")}>
              <option value="">Selecciona una categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cantidad">
            <Input type="number" value={form.cantidad} onChange={set("cantidad")} placeholder="0" />
          </Field>
          <Field label="Unidad">
            <CatalogSelect
              catalogo="unidades"
              items={unidades}
              value={form.unidad_id}
              onChange={setVal("unidad_id")}
              onReload={setUnidades}
              placeholder="Sin unidad"
              extensible
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Monto">
            <Input type="number" step="0.01" value={form.monto} onChange={set("monto")} placeholder="0.00" />
          </Field>
          <Field label="Moneda">
            <Select value={form.moneda} onChange={set("moneda")}>
              <option value="PEN">PEN (S/)</option>
              <option value="USD">USD ($)</option>
            </Select>
          </Field>
        </div>
        <Field label="Fecha">
          <Input type="date" value={form.fecha} onChange={set("fecha")} />
        </Field>
        <Field label="Descripción">
          <Textarea
            value={form.descripcion}
            onChange={set("descripcion")}
            placeholder="Detalle del costo…"
          />
        </Field>
      </div>
    </Modal>
  );
}

function CostosTab({ biohuertoId }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = biohuertoId ? { biohuerto_id: biohuertoId } : {};
      setRows(asList(await trazabilidadApi.costos(params)));
    } catch {
      toast("No se pudieron cargar los costos", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [biohuertoId]);

  const handleSave = async (body) => {
    try {
      await trazabilidadApi.crearCosto(body);
      toast("Costo registrado");
      setOpen(false);
      await load();
    } catch {
      toast("No se pudo registrar el costo", "danger");
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
    { key: "categoria", label: "Categoría", width: "1fr" },
    {
      key: "descripcion",
      label: "Descripción",
      width: "1.4fr",
      render: (r) => (
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-muted-1">
          {r.descripcion || "—"}
        </span>
      ),
    },
    {
      key: "monto",
      label: "Monto",
      width: ".9fr",
      align: "right",
      render: (r) => (
        <span className="whitespace-nowrap font-extrabold text-terracotta">
          {fmtMoneda(r.monto, r.moneda)}
        </span>
      ),
    },
    {
      key: "fecha",
      label: "Fecha",
      width: ".9fr",
      render: (r) => <span className="whitespace-nowrap text-muted-1">{fmtFecha(r.fecha)}</span>,
    },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button icon="plus" onClick={() => setOpen(true)}>
          Registrar costo
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        empty={{
          icon: "coins",
          title: "No hay costos",
          desc: "No se encontraron costos para el biohuerto seleccionado.",
        }}
      />
      {!loading && rows.length > 0 && (
        <div className="mt-7 border-t border-line pt-[22px] text-sm text-muted-2">
          Mostrando {rows.length} costo{rows.length === 1 ? "" : "s"}
        </div>
      )}
      <CostoModal open={open} onClose={() => setOpen(false)} onSave={handleSave} />
    </>
  );
}

/* ============================ PÁGINA ============================ */

const TABS = [
  { id: "practicas", label: "Prácticas", icon: "recycle" },
  { id: "costos", label: "Costos", icon: "coins" },
];

export default function Trazabilidad() {
  const toast = useToast();
  const [tab, setTab] = useState("practicas");
  const [biohuertos, setBiohuertos] = useState([]);
  const [biohuertoId, setBiohuertoId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setBiohuertos(asList(await biohuertosApi.list()));
      } catch {
        toast("No se pudieron cargar los biohuertos", "danger");
      }
    })();
  }, []);

  return (
    <div className="animate-fade">
      <PageHeader
        title="Trazabilidad"
        subtitle="Registro de prácticas agrícolas y costos por cultivo."
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

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

      {tab === "practicas" ? (
        <PracticasTab biohuertoId={biohuertoId} />
      ) : (
        <CostosTab biohuertoId={biohuertoId} />
      )}
    </div>
  );
}
