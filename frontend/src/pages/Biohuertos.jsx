import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import EmptyState from "../components/ui/EmptyState.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import { useBiohuertos } from "../hooks/useBiohuertos.js";
import { api } from "../lib/api.js";
import { number } from "../lib/format.js";

const schema = z.object({
  nombre: z.string().min(2),
  codigo: z.string().min(2).max(60),
  area_m2: z.string().min(1),
  descripcion: z.string().optional(),
});

export default function Biohuertos() {
  const { biohuertos, loading, error, reload } = useBiohuertos();
  const [apiError, setApiError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  async function onSubmit(values) {
    setApiError("");
    try {
      await api.post("/api/biohuertos", values);
      reset();
      reload();
    } catch (err) {
      setApiError(err.response?.data?.detail || "No se pudo crear el biohuerto.");
    }
  }

  return (
    <div>
      <PageHeader title="Biohuertos" eyebrow="Ficha productiva" />
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <form className="panel p-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex items-center gap-2">
            <Plus size={18} className="text-leaf-800" />
            <h2 className="text-base font-bold text-slate-950">Nuevo biohuerto</h2>
          </div>
          <div className="mt-4 space-y-3">
            <Field label="Nombre" error={errors.nombre?.message}>
              <input className="form-input" {...register("nombre")} />
            </Field>
            <Field label="Codigo" error={errors.codigo?.message}>
              <input className="form-input" placeholder="BH-001" {...register("codigo")} />
            </Field>
            <Field label="Area m2" error={errors.area_m2?.message}>
              <input className="form-input" type="number" step="0.01" {...register("area_m2")} />
            </Field>
            <Field label="Descripcion" error={errors.descripcion?.message}>
              <textarea className="form-input min-h-24 resize-y" {...register("descripcion")} />
            </Field>
          </div>
          {apiError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{apiError}</p>}
          <button
            className="mt-4 h-10 w-full rounded-md bg-leaf-800 px-4 text-sm font-bold text-white hover:bg-leaf-900 disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Guardando..." : "Guardar biohuerto"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-950">Mis fichas</h2>
            <button className="icon-button" onClick={reload} type="button" title="Actualizar">
              <RefreshCw size={18} />
            </button>
          </div>
          {loading && <p className="text-sm text-slate-500">Cargando biohuertos...</p>}
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {!loading && biohuertos.length === 0 && <EmptyState title="Sin biohuertos registrados" detail="Crea la primera ficha para iniciar la demo." />}
          <div className="grid gap-3 sm:grid-cols-2">
            {biohuertos.map((biohuerto) => (
              <article className="panel p-4" key={biohuerto.id}>
                <p className="text-xs font-semibold uppercase tracking-wide text-leaf-800">{biohuerto.codigo}</p>
                <h3 className="mt-1 text-lg font-bold text-slate-950">{biohuerto.nombre}</h3>
                <p className="mt-2 text-sm text-slate-500">{biohuerto.descripcion || "Sin descripcion"}</p>
                <p className="mt-3 text-sm font-semibold text-slate-700">{number(biohuerto.area_m2)} m2</p>
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

