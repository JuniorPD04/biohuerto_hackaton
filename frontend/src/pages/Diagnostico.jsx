import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, ClipboardList, RefreshCw, SearchCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import EmptyState from "../components/ui/EmptyState.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";
import { useBiohuertos } from "../hooks/useBiohuertos.js";
import { api } from "../lib/api.js";
import { dateText } from "../lib/format.js";

const guidedSchema = z.object({
  biohuerto_id: optionalPositiveNumber(),
  especie: z.string().min(2),
  zona_afectada: z.string().optional(),
  tiempo_dias: z.coerce.number().min(0).max(365).optional(),
  sintomas: z.array(z.string()).min(1, "Selecciona al menos un sintoma"),
});

const imageSchema = z.object({
  biohuerto_id: optionalPositiveNumber(),
  especie: z.string().min(2),
  zona_afectada: z.string().optional(),
  tiempo_dias: z.coerce.number().min(0).max(365).optional(),
  sintomas: z.array(z.string()).default([]),
  image_base64: z.string().min(64, "Selecciona una imagen"),
  mime_type: z.string(),
});

const sintomas = [
  "manchas amarillas",
  "hojas mordidas",
  "marchitez",
  "pulgones o insectos",
  "moho blanco",
  "crecimiento lento",
  "hojas secas",
  "tallos debiles",
];

const especies = ["Tomate", "Lechuga", "Culantro", "Rabanito", "Aji", "Zapallo", "Albahaca", "Espinaca"];

function optionalPositiveNumber() {
  return z.preprocess((value) => (value === "" || value === null ? undefined : value), z.coerce.number().positive().optional());
}

export default function Diagnostico() {
  const { biohuertos, selected } = useBiohuertos();
  const [tab, setTab] = useState("guiado");
  const [diagnosticos, setDiagnosticos] = useState([]);
  const [latest, setLatest] = useState(null);
  const [apiError, setApiError] = useState("");
  const [preview, setPreview] = useState("");

  const guidedForm = useForm({
    resolver: zodResolver(guidedSchema),
    defaultValues: { especie: "Tomate", sintomas: [], tiempo_dias: 3 },
  });
  const imageForm = useForm({
    resolver: zodResolver(imageSchema),
    defaultValues: { especie: "Tomate", sintomas: [], tiempo_dias: 3 },
  });

  useEffect(() => {
    if (selected) {
      guidedForm.setValue("biohuerto_id", selected.id);
      imageForm.setValue("biohuerto_id", selected.id);
    }
  }, [guidedForm, imageForm, selected]);

  const load = useCallback(async () => {
    const url = selected ? `/api/diagnostico?biohuerto_id=${selected.id}` : "/api/diagnostico";
    const { data } = await api.get(url);
    setDiagnosticos(data);
  }, [selected]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function submitGuided(values) {
    setApiError("");
    try {
      const { data } = await api.post("/api/diagnostico/guiado", {
        ...values,
        zona_afectada: values.zona_afectada || null,
        tiempo_dias: values.tiempo_dias ?? null,
      });
      setLatest(data);
      guidedForm.reset({ biohuerto_id: selected?.id, especie: values.especie, sintomas: [], tiempo_dias: 3 });
      load();
    } catch (err) {
      setApiError(err.response?.data?.detail || "No se pudo generar el diagnostico guiado.");
    }
  }

  async function submitImage(values) {
    setApiError("");
    try {
      const { data } = await api.post("/api/diagnostico/imagen", {
        ...values,
        zona_afectada: values.zona_afectada || null,
        tiempo_dias: values.tiempo_dias ?? null,
      });
      setLatest(data);
      imageForm.reset({ biohuerto_id: selected?.id, especie: values.especie, sintomas: [], tiempo_dias: 3 });
      setPreview("");
      load();
    } catch (err) {
      setApiError(err.response?.data?.detail || "No se pudo procesar la imagen.");
    }
  }

  async function handleImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setApiError("La imagen supera 5 MB.");
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    const [, payload] = dataUrl.split(",");
    setPreview(dataUrl);
    imageForm.setValue("image_base64", payload, { shouldValidate: true });
    imageForm.setValue("mime_type", file.type || "image/jpeg");
  }

  return (
    <div>
      <PageHeader
        title="Diagnostico"
        eyebrow="Asistencia agroecologica"
        actions={
          <button className="icon-button" onClick={load} title="Actualizar" type="button">
            <RefreshCw size={18} />
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 rounded-lg border border-slate-200 bg-white p-1">
        <TabButton active={tab === "guiado"} icon={ClipboardList} label="Guiado" onClick={() => setTab("guiado")} />
        <TabButton active={tab === "imagen"} icon={Camera} label="Imagen" onClick={() => setTab("imagen")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="panel p-4">
          <div className="flex items-center gap-2">
            <SearchCheck className="text-leaf-800" size={18} />
            <h2 className="text-base font-bold text-slate-950">{tab === "guiado" ? "Formulario guiado" : "Foto opcional"}</h2>
          </div>

          {tab === "guiado" ? (
            <form className="mt-4 space-y-3" onSubmit={guidedForm.handleSubmit(submitGuided)}>
              <SharedFields form={guidedForm} biohuertos={biohuertos} />
              <Symptoms form={guidedForm} />
              {guidedForm.formState.errors.sintomas && <p className="text-xs text-red-600">{guidedForm.formState.errors.sintomas.message}</p>}
              <SubmitButton loading={guidedForm.formState.isSubmitting}>Generar diagnostico</SubmitButton>
            </form>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={imageForm.handleSubmit(submitImage)}>
              <SharedFields form={imageForm} biohuertos={biohuertos} />
              <Symptoms form={imageForm} compact />
              <label className="block">
                <span className="form-label">Imagen</span>
                <input className="form-input mt-1" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageFile} />
              </label>
              {preview && <img className="aspect-video w-full rounded-lg border border-slate-200 object-cover" src={preview} alt="Preview diagnostico" />}
              {imageForm.formState.errors.image_base64 && <p className="text-xs text-red-600">{imageForm.formState.errors.image_base64.message}</p>}
              <SubmitButton loading={imageForm.formState.isSubmitting}>Analizar imagen</SubmitButton>
            </form>
          )}

          {apiError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{apiError}</p>}
        </section>

        <section className="space-y-4">
          {latest && <ResultCard diagnostico={latest} />}
          <div>
            <h2 className="mb-3 text-base font-bold text-slate-950">Historial</h2>
            {diagnosticos.length === 0 && <EmptyState title="Sin diagnosticos registrados" detail="El formulario guiado es el flujo principal del PMV." />}
            <div className="space-y-3">
              {diagnosticos.map((item) => (
                <ResultCard diagnostico={item} compact key={item.id} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SharedFields({ form, biohuertos }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="form-label">Biohuerto</span>
        <select className="form-input mt-1" {...form.register("biohuerto_id")}>
          <option value="">Sin ficha</option>
          {biohuertos.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="form-label">Especie</span>
        <select className="form-input mt-1" {...form.register("especie")}>
          {especies.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="form-label">Zona afectada</span>
        <select className="form-input mt-1" {...form.register("zona_afectada")}>
          <option value="">Sin especificar</option>
          <option value="hojas">Hojas</option>
          <option value="tallo">Tallo</option>
          <option value="raiz">Raiz</option>
          <option value="fruto">Fruto</option>
          <option value="planta completa">Planta completa</option>
        </select>
      </label>
      <label className="block">
        <span className="form-label">Dias de evolucion</span>
        <input className="form-input mt-1" type="number" min="0" max="365" {...form.register("tiempo_dias")} />
      </label>
    </div>
  );
}

function Symptoms({ form, compact = false }) {
  return (
    <fieldset>
      <legend className="form-label">Sintomas</legend>
      <div className={`mt-2 grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
        {sintomas.map((item) => (
          <label key={item} className="flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
            <input className="h-4 w-4 accent-leaf-800" type="checkbox" value={item} {...form.register("sintomas")} />
            {item}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ResultCard({ diagnostico, compact = false }) {
  const tone = diagnostico.nivel_riesgo === "alto" ? "red" : diagnostico.nivel_riesgo === "medio" ? "amber" : "leaf";
  return (
    <article className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-leaf-800">{diagnostico.modalidad}</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">{diagnostico.resultado_nombre || "Diagnostico registrado"}</h3>
        </div>
        <StatusBadge tone={tone}>{diagnostico.nivel_riesgo || "bajo"}</StatusBadge>
      </div>
      <p className="mt-3 text-sm text-slate-600">{diagnostico.recomendacion_resumen}</p>
      {!compact && (
        <div className="mt-3 rounded-md bg-leaf-50 p-3 text-sm text-leaf-900">
          Cultivo: {diagnostico.especie}. Sintomas: {(diagnostico.sintomas || []).join(", ") || "-"}.
        </div>
      )}
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{dateText(diagnostico.created_at)}</p>
    </article>
  );
}

function SubmitButton({ loading, children }) {
  return (
    <button className="h-10 w-full rounded-md bg-leaf-800 text-sm font-bold text-white hover:bg-leaf-900 disabled:opacity-60" disabled={loading} type="submit">
      {loading ? "Analizando..." : children}
    </button>
  );
}

function TabButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      className={`flex h-10 items-center justify-center gap-2 rounded-md text-sm font-bold transition ${
        active ? "bg-leaf-800 text-white" : "text-slate-600 hover:bg-slate-50"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
