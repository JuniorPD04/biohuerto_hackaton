import { zodResolver } from "@hookform/resolvers/zod";
import { Coins, Leaf, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import EmptyState from "../components/ui/EmptyState.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import { useBiohuertos } from "../hooks/useBiohuertos.js";
import { api } from "../lib/api.js";
import { dateText, money } from "../lib/format.js";

const practicaSchema = z.object({
  biohuerto_id: z.coerce.number().positive(),
  tipo_practica: z.string().min(2),
  descripcion: z.string().min(2),
  insumo: z.string().optional(),
  cantidad: z.string().optional(),
  unidad: z.string().optional(),
  fecha_aplicacion: z.string().min(1),
  es_sostenible: z.boolean().default(true),
});

const costoSchema = z.object({
  biohuerto_id: z.coerce.number().positive(),
  categoria: z.string().min(2),
  descripcion: z.string().min(2),
  monto: z.string().min(1),
  moneda: z.string().length(3),
  fecha: z.string().min(1),
});

export default function Trazabilidad() {
  const { biohuertos, selected } = useBiohuertos();
  const [practicas, setPracticas] = useState([]);
  const [costos, setCostos] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");

  const practicaForm = useForm({
    resolver: zodResolver(practicaSchema),
    defaultValues: { es_sostenible: true },
  });
  const costoForm = useForm({
    resolver: zodResolver(costoSchema),
    defaultValues: { moneda: "PEN" },
  });

  useEffect(() => {
    if (selected) {
      practicaForm.setValue("biohuerto_id", selected.id);
      costoForm.setValue("biohuerto_id", selected.id);
    }
  }, [costoForm, practicaForm, selected]);

  const load = useCallback(async () => {
    if (!selected) return;
    setError("");
    try {
      const [practicasRes, costosRes, resumenRes] = await Promise.all([
        api.get(`/api/trazabilidad/practicas?biohuerto_id=${selected.id}`),
        api.get(`/api/trazabilidad/costos?biohuerto_id=${selected.id}`),
        api.get(`/api/trazabilidad/biohuertos/${selected.id}/resumen`),
      ]);
      setPracticas(practicasRes.data);
      setCostos(costosRes.data);
      setResumen(resumenRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo cargar trazabilidad.");
    }
  }, [selected]);

  useEffect(() => {
    load();
  }, [load]);

  async function createPractica(values) {
    await api.post("/api/trazabilidad/practicas", {
      ...values,
      cantidad: values.cantidad || null,
      insumo: values.insumo || null,
      unidad: values.unidad || null,
    });
    practicaForm.reset({ biohuerto_id: selected?.id, es_sostenible: true });
    load();
  }

  async function createCosto(values) {
    await api.post("/api/trazabilidad/costos", values);
    costoForm.reset({ biohuerto_id: selected?.id, moneda: "PEN" });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Trazabilidad"
        eyebrow={selected?.nombre || "Practicas y costos"}
        actions={
          <button className="icon-button" onClick={load} title="Actualizar" type="button">
            <RefreshCw size={18} />
          </button>
        }
      />
      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {resumen && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Summary icon={Leaf} label="Practicas sostenibles" value={`${resumen.practicas_sostenibles}/${resumen.practicas_total}`} />
          <Summary icon={Leaf} label="Sostenibilidad" value={`${resumen.sostenibilidad_porcentaje}%`} />
          <Summary icon={Coins} label="Costos acumulados" value={money(resumen.costos_total)} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <FormPanel title="Registrar practica">
          <form onSubmit={practicaForm.handleSubmit(createPractica)} className="space-y-3">
            <BiohuertoSelect biohuertos={biohuertos} register={practicaForm.register("biohuerto_id")} />
            <input className="form-input" placeholder="Tipo de practica" {...practicaForm.register("tipo_practica")} />
            <textarea className="form-input min-h-24 resize-y" placeholder="Descripcion" {...practicaForm.register("descripcion")} />
            <div className="grid grid-cols-3 gap-2">
              <input className="form-input" placeholder="Insumo" {...practicaForm.register("insumo")} />
              <input className="form-input" placeholder="Cantidad" type="number" step="0.01" {...practicaForm.register("cantidad")} />
              <input className="form-input" placeholder="Unidad" {...practicaForm.register("unidad")} />
            </div>
            <input className="form-input" type="date" {...practicaForm.register("fecha_aplicacion")} />
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input className="h-4 w-4 accent-leaf-800" type="checkbox" {...practicaForm.register("es_sostenible")} />
              Practica sostenible
            </label>
            <button className="h-10 w-full rounded-md bg-leaf-800 text-sm font-bold text-white hover:bg-leaf-900" type="submit">
              Guardar practica
            </button>
          </form>
        </FormPanel>

        <FormPanel title="Registrar costo">
          <form onSubmit={costoForm.handleSubmit(createCosto)} className="space-y-3">
            <BiohuertoSelect biohuertos={biohuertos} register={costoForm.register("biohuerto_id")} />
            <input className="form-input" placeholder="Categoria" {...costoForm.register("categoria")} />
            <textarea className="form-input min-h-24 resize-y" placeholder="Descripcion" {...costoForm.register("descripcion")} />
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <input className="form-input" placeholder="Monto" type="number" step="0.01" {...costoForm.register("monto")} />
              <input className="form-input" {...costoForm.register("moneda")} />
            </div>
            <input className="form-input" type="date" {...costoForm.register("fecha")} />
            <button className="h-10 w-full rounded-md bg-slate-900 text-sm font-bold text-white hover:bg-slate-800" type="submit">
              Guardar costo
            </button>
          </form>
        </FormPanel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-950">Practicas recientes</h2>
          {practicas.length === 0 && <EmptyState title="Sin practicas registradas" />}
          {practicas.map((item) => (
            <article className="panel p-4" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">{item.tipo_practica}</h3>
                  <p className="mt-1 text-sm text-slate-600">{item.descripcion}</p>
                </div>
                <StatusBadge tone={item.es_sostenible ? "leaf" : "amber"}>{item.es_sostenible ? "Sostenible" : "Revision"}</StatusBadge>
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{dateText(item.fecha_aplicacion)}</p>
            </article>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-950">Costos recientes</h2>
          {costos.length === 0 && <EmptyState title="Sin costos registrados" />}
          {costos.map((item) => (
            <article className="panel flex items-center justify-between gap-3 p-4" key={item.id}>
              <div>
                <h3 className="font-bold text-slate-950">{item.categoria}</h3>
                <p className="mt-1 text-sm text-slate-600">{item.descripcion}</p>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{dateText(item.fecha)}</p>
              </div>
              <p className="text-lg font-bold text-slate-950">{money(item.monto)}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function Summary({ icon: Icon, label, value }) {
  return (
    <div className="panel flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-leaf-50 text-leaf-800">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-950">{value}</p>
      </div>
    </div>
  );
}

function FormPanel({ title, children }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-4 text-base font-bold text-slate-950">{title}</h2>
      {children}
    </section>
  );
}

function BiohuertoSelect({ biohuertos, register }) {
  return (
    <select className="form-input" {...register}>
      {biohuertos.map((item) => (
        <option key={item.id} value={item.id}>
          {item.nombre}
        </option>
      ))}
    </select>
  );
}
