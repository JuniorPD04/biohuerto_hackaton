import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import EmptyState from "../components/ui/EmptyState.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import { useBiohuertos } from "../hooks/useBiohuertos.js";
import { api } from "../lib/api.js";
import { dateText, stageLabel } from "../lib/format.js";

const schema = z.object({
  biohuerto_id: z.coerce.number().positive(),
  especie: z.string().min(2),
  variedad: z.string().optional(),
  etapa: z.string().min(2),
  fecha_siembra: z.string().min(1),
  fecha_estimada_cosecha: z.string().optional(),
  cantidad: z.string().optional(),
  area_m2: z.string().optional(),
  campania: z.string().optional(),
});

export default function Cultivos() {
  const { biohuertos, selected } = useBiohuertos();
  const [cultivos, setCultivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { etapa: "semillero" } });

  useEffect(() => {
    if (selected) setValue("biohuerto_id", selected.id);
  }, [selected, setValue]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/cultivos");
      setCultivos(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(values) {
    setApiError("");
    try {
      await api.post("/api/cultivos", {
        ...values,
        cantidad: values.cantidad || null,
        area_m2: values.area_m2 || null,
        fecha_estimada_cosecha: values.fecha_estimada_cosecha || null,
      });
      reset({ etapa: "semillero", biohuerto_id: selected?.id });
      load();
    } catch (err) {
      setApiError(err.response?.data?.detail || "No se pudo crear el cultivo.");
    }
  }

  return (
    <div>
      <PageHeader title="Cultivos" eyebrow="Ciclo productivo" />
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <form className="panel p-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex items-center gap-2">
            <Plus size={18} className="text-leaf-800" />
            <h2 className="text-base font-bold text-slate-950">Nuevo cultivo</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Biohuerto" error={errors.biohuerto_id?.message}>
              <select className="form-input" {...register("biohuerto_id")}>
                {biohuertos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Especie" error={errors.especie?.message}>
              <input className="form-input" placeholder="Lechuga" {...register("especie")} />
            </Field>
            <Field label="Variedad" error={errors.variedad?.message}>
              <input className="form-input" placeholder="Seda" {...register("variedad")} />
            </Field>
            <Field label="Etapa" error={errors.etapa?.message}>
              <select className="form-input" {...register("etapa")}>
                {["semillero", "crecimiento", "floracion", "fructificacion", "cosecha", "finalizado"].map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabel(stage)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Siembra" error={errors.fecha_siembra?.message}>
              <input className="form-input" type="date" {...register("fecha_siembra")} />
            </Field>
            <Field label="Cosecha estimada" error={errors.fecha_estimada_cosecha?.message}>
              <input className="form-input" type="date" {...register("fecha_estimada_cosecha")} />
            </Field>
            <Field label="Cantidad" error={errors.cantidad?.message}>
              <input className="form-input" type="number" step="0.01" {...register("cantidad")} />
            </Field>
            <Field label="Area m2" error={errors.area_m2?.message}>
              <input className="form-input" type="number" step="0.01" {...register("area_m2")} />
            </Field>
            <Field label="Campania" error={errors.campania?.message}>
              <input className="form-input" {...register("campania")} />
            </Field>
          </div>
          {apiError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{apiError}</p>}
          <button className="mt-4 h-10 w-full rounded-md bg-leaf-800 text-sm font-bold text-white hover:bg-leaf-900 disabled:opacity-60" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Guardando..." : "Guardar cultivo"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-950">Historial de cultivos</h2>
            <button className="icon-button" onClick={load} title="Actualizar" type="button">
              <RefreshCw size={18} />
            </button>
          </div>
          {loading && <p className="text-sm text-slate-500">Cargando cultivos...</p>}
          {!loading && cultivos.length === 0 && <EmptyState title="Sin cultivos registrados" detail="Agrega un cultivo para iniciar el ciclo productivo." />}
          <div className="space-y-3">
            {cultivos.map((cultivo) => (
              <article className="panel p-4" key={cultivo.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-950">{cultivo.especie}</h3>
                    <p className="text-sm text-slate-500">{cultivo.variedad || cultivo.campania || "Sin variedad"}</p>
                  </div>
                  <StatusBadge tone={cultivo.etapa === "cosecha" ? "amber" : "leaf"}>{stageLabel(cultivo.etapa)}</StatusBadge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <p className="rounded-md bg-slate-50 p-2 text-slate-600">Siembra: {dateText(cultivo.fecha_siembra)}</p>
                  <p className="rounded-md bg-slate-50 p-2 text-slate-600">Cosecha: {dateText(cultivo.fecha_estimada_cosecha)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <span className="mt-1 block">{children}</span>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

