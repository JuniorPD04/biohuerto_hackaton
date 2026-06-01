import { zodResolver } from "@hookform/resolvers/zod";
import { Activity, RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import EmptyState from "../components/ui/EmptyState.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import { useOffline } from "../context/OfflineContext.jsx";
import { useBiohuertos } from "../hooks/useBiohuertos.js";
import { api } from "../lib/api.js";
import { dateText, number } from "../lib/format.js";

const schema = z.object({
  biohuerto_id: z.coerce.number().positive(),
  humedad_porcentaje: z.string().optional(),
  temperatura_c: z.string().optional(),
  luminosidad_lux: z.string().optional(),
  incidencia: z.string().optional(),
  observacion: z.string().optional(),
});

export default function Monitoreo() {
  const { biohuertos, selected } = useBiohuertos();
  const { isOnline, enqueue, pendingCount, syncPending, lastSyncMessage } = useOffline();
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (selected) setValue("biohuerto_id", selected.id);
  }, [selected, setValue]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = selected ? `/api/monitoreo?biohuerto_id=${selected.id}` : "/api/monitoreo";
      const { data } = await api.get(url);
      setRegistros(data);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(values) {
    setApiError("");
    const createdAt = new Date().toISOString();
    const monitoreoPayload = {
      ...values,
      humedad_porcentaje: values.humedad_porcentaje || null,
      temperatura_c: values.temperatura_c || null,
      luminosidad_lux: values.luminosidad_lux || null,
      incidencia: values.incidencia || null,
      observacion: values.observacion || null,
      registrado_en: createdAt,
    };
    try {
      if (!isOnline) {
        const monitoreoId = crypto.randomUUID();
        await enqueue({
          tabla: "monitoreo_registros",
          uuid: monitoreoId,
          payload: monitoreoPayload,
          created_at_local: createdAt,
        });
        if (values.incidencia) {
          await enqueue({
            tabla: "incidencias",
            uuid: crypto.randomUUID(),
            payload: {
              biohuerto_id: values.biohuerto_id,
              tipo: "monitoreo",
              descripcion: values.incidencia,
              severidad: "media",
              estado: "abierta",
              reportado_en: createdAt,
            },
            created_at_local: createdAt,
          });
        }
        setRegistros((current) => [
          {
            id: monitoreoId,
            ...monitoreoPayload,
            is_synced: false,
            created_at: createdAt,
            updated_at: createdAt,
          },
          ...current,
        ]);
      } else {
        await api.post("/api/monitoreo", monitoreoPayload);
        if (values.incidencia) {
          await api.post("/api/incidencias", {
            biohuerto_id: values.biohuerto_id,
            tipo: "monitoreo",
            descripcion: values.incidencia,
            severidad: "media",
            reportado_en: createdAt,
          });
        }
      }
      reset({ biohuerto_id: selected?.id });
      if (isOnline) load();
    } catch (err) {
      setApiError(err.response?.data?.detail || "No se pudo registrar monitoreo.");
    }
  }

  return (
    <div>
      <PageHeader
        title="Monitoreo"
        eyebrow="Registro manual"
        actions={
          pendingCount > 0 ? (
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-amber-50 px-3 text-sm font-bold text-amber-700"
              onClick={syncPending}
              type="button"
            >
              <RefreshCw size={17} />
              {pendingCount} pendientes
            </button>
          ) : null
        }
      />
      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          <WifiOff size={17} />
          Sin conexion, guardando monitoreo e incidencias localmente.
        </div>
      )}
      {lastSyncMessage && isOnline && pendingCount > 0 && (
        <p className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">{lastSyncMessage}</p>
      )}
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <form className="panel p-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="flex items-center gap-2">
            <Activity className="text-leaf-800" size={18} />
            <h2 className="text-base font-bold text-slate-950">Nuevo registro</h2>
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
            <Field label="Humedad %" error={errors.humedad_porcentaje?.message}>
              <input className="form-input" type="number" step="0.01" {...register("humedad_porcentaje")} />
            </Field>
            <Field label="Temperatura C" error={errors.temperatura_c?.message}>
              <input className="form-input" type="number" step="0.01" {...register("temperatura_c")} />
            </Field>
            <Field label="Luminosidad lux" error={errors.luminosidad_lux?.message}>
              <input className="form-input" type="number" step="0.01" {...register("luminosidad_lux")} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Incidencia" error={errors.incidencia?.message}>
                <input className="form-input" placeholder="Opcional" {...register("incidencia")} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Observacion" error={errors.observacion?.message}>
                <textarea className="form-input min-h-24 resize-y" {...register("observacion")} />
              </Field>
            </div>
          </div>
          {apiError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{apiError}</p>}
          <button className="mt-4 h-10 w-full rounded-md bg-leaf-800 text-sm font-bold text-white hover:bg-leaf-900 disabled:opacity-60" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Registrando..." : "Registrar monitoreo"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-950">Historial reciente</h2>
            <button className="icon-button" onClick={load} title="Actualizar" type="button">
              <RefreshCw size={18} />
            </button>
          </div>
          {loading && <p className="text-sm text-slate-500">Cargando monitoreo...</p>}
          {!loading && registros.length === 0 && <EmptyState title="Sin registros de monitoreo" detail="Agrega humedad, temperatura o incidencias para activar el seguimiento." />}
          <div className="space-y-3">
            {registros.map((item) => (
              <article className="panel p-4" key={item.id}>
                <div className="grid grid-cols-3 gap-2">
                  <Reading label="Humedad" value={`${number(item.humedad_porcentaje)}%`} />
                  <Reading label="Temp." value={`${number(item.temperatura_c)} C`} />
                  <Reading label="Luz" value={number(item.luminosidad_lux)} />
                </div>
                {(item.incidencia || item.observacion) && <p className="mt-3 text-sm text-slate-600">{item.incidencia || item.observacion}</p>}
                {item.is_synced === false && <p className="mt-2 text-xs font-bold uppercase tracking-wide text-amber-700">Pendiente de sincronizar</p>}
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{dateText(item.registrado_en)}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Reading({ label, value }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
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
