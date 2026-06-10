import { useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  EmptyState,
  Card,
  Button,
  Badge,
  Modal,
  Field,
  Select,
  Icon,
  ImageUpload,
} from "../components/ui/primitives.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import { fmtFecha } from "../lib/theme.js";
import { diagnosticoApi, cultivosApi } from "../lib/resources.js";

const PARTES = ["Hoja", "Fruto", "Tallo", "Raíz", "Planta completa"];

const cultivoNombre = (c) =>
  c ? [c.especie, c.variedad].filter(Boolean).join(" · ") : "Sin cultivo";

const esSano = (d) => (d.resultado || "").startsWith("Planta sana");

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return { mime_type: match[1], image_base64: match[2] };
}

export default function Fitosanitario() {
  const toast = useToast();
  const [diagnosticos, setDiagnosticos] = useState([]);
  const [cultivos, setCultivos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [recomendando, setRecomendando] = useState(null);

  const pedirRecomendacion = async (id) => {
    setRecomendando(id);
    try {
      const actualizado = await diagnosticoApi.recomendacion(id);
      setDiagnosticos((prev) => prev.map((d) => (d.id === id ? actualizado : d)));
      if (!actualizado.recomendacion) {
        toast("No se encontró una recomendación para este diagnóstico", "danger");
      }
    } catch {
      toast("No se pudo generar la recomendación ahora. Inténtalo más tarde.", "danger");
    } finally {
      setRecomendando(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [diags, cults] = await Promise.all([
        diagnosticoApi.list().catch(() => []),
        cultivosApi.list().catch(() => []),
      ]);
      setDiagnosticos(Array.isArray(diags) ? diags : []);
      setCultivos(Array.isArray(cults) ? cults : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Index de cultivos por id para resolver especie/variedad del diagnóstico.
  const cultivoById = useMemo(() => {
    const m = {};
    cultivos.forEach((c) => (m[c.id] = c));
    return m;
  }, [cultivos]);

  // Diagnósticos enriquecidos y ordenados por fecha desc.
  const items = useMemo(() => {
    const enriched = diagnosticos.map((d) => ({
      ...d,
      cultivoLabel: cultivoNombre(cultivoById[d.cultivo_id]),
      sano: esSano(d),
    }));
    return enriched.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [diagnosticos, cultivoById]);

  return (
    <div className="animate-fade">
      <PageHeader
        title="Diagnóstico fitosanitario"
        subtitle="Sube una foto de la hoja afectada y obtén un diagnóstico automático con IA."
        action={
          <Button icon="plus" onClick={() => setOpen(true)}>
            Nuevo diagnóstico
          </Button>
        }
      />

      {loading ? (
        <EmptyState icon="stethoscope" title="Cargando diagnósticos…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="stethoscope"
          title="Sin diagnósticos registrados"
          desc="Registra un nuevo diagnóstico subiendo una foto del cultivo para evaluar su estado sanitario."
          action={
            <Button icon="plus" onClick={() => setOpen(true)}>
              Nuevo diagnóstico
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {items.map((d) => (
            <Card key={d.id} pad="p-[22px]">
              <div className="flex items-start gap-4">
                {d.imagen && (
                  <img
                    src={d.imagen}
                    alt=""
                    className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="m-0 text-[17px] font-extrabold leading-[1.3] text-text">
                      {d.resultado || "Diagnóstico"}
                    </h3>
                    {d.confianza != null && (
                      <Badge
                        bg={d.sano ? "#dcefd7" : "#fbe1de"}
                        fg={d.sano ? "#2f6b34" : "#b23a2e"}
                        dot={d.sano ? "#3f9a48" : "#d6584a"}
                      >
                        {Math.round(Number(d.confianza))}% confianza
                      </Badge>
                    )}
                  </div>
                  {d.nombre_cientifico && (
                    <p className="mt-1 text-[13px] italic text-muted-2">{d.nombre_cientifico}</p>
                  )}
                  {Array.isArray(d.alternativas) && d.alternativas.length > 0 && (
                    <div className="mt-3">
                      <p className="m-0 text-[12.5px] font-bold text-muted-2">Otras posibilidades:</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {d.alternativas.map((alt) => (
                          <span
                            key={alt.orden}
                            className="inline-flex items-center gap-[6px] rounded-full bg-chip px-[11px] py-1 text-[12.5px] font-bold text-muted-2"
                          >
                            {alt.enfermedad}
                            {alt.confianza_pct != null && (
                              <span className="text-muted-2/80">
                                {Math.round(Number(alt.confianza_pct))}%
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.recomendacion ? (
                    <div className="mt-3 rounded-xl bg-chip p-3">
                      <p className="m-0 text-[12.5px] font-bold text-muted-2">Recomendación de manejo:</p>
                      <p className="m-0 mt-1 whitespace-pre-line text-[13.5px] text-text">{d.recomendacion}</p>
                    </div>
                  ) : (
                    !d.sano && (
                      <div className="mt-3">
                        <Button
                          variant="ghost"
                          icon="bulb"
                          onClick={() => pedirRecomendacion(d.id)}
                          disabled={recomendando === d.id}
                        >
                          {recomendando === d.id ? "Generando recomendación…" : "Recomendación"}
                        </Button>
                      </div>
                    )
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px] font-bold text-muted-2">
                    <span className="inline-flex items-center gap-[6px]">
                      <Icon name="sprout" size={15} />
                      {d.cultivoLabel}
                    </span>
                    {d.parte_planta && (
                      <span className="inline-flex items-center gap-[6px]">
                        <Icon name="leaf" size={15} />
                        {d.parte_planta}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-[6px]">
                      <Icon name="calendar" size={15} />
                      {fmtFecha(d.fecha)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <DiagnosticoModal
        open={open}
        onClose={() => setOpen(false)}
        cultivos={cultivos}
        toast={toast}
        onCreated={() => {
          setOpen(false);
          load();
        }}
      />
    </div>
  );
}

function DiagnosticoModal({ open, onClose, cultivos, toast, onCreated }) {
  const [cultivoId, setCultivoId] = useState("");
  const [parte, setParte] = useState("Hoja");
  const [foto, setFoto] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) {
      setCultivoId("");
      setParte("");
      setFoto("");
    }
  }, [open]);

  const submit = async () => {
    const parsed = parseDataUrl(foto);
    if (!parsed) {
      toast("Sube una foto del cultivo (PNG o JPG)", "danger");
      return;
    }
    setEnviando(true);
    try {
      await diagnosticoApi.imagen({
        cultivo_id: cultivoId || null,
        parte_planta: parte || null,
        ...parsed,
      });
      toast("Diagnóstico generado correctamente");
      onCreated();
    } catch {
      toast("No se pudo analizar la imagen ahora. Inténtalo más tarde.", "danger");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo diagnóstico"
      subtitle="Sube una foto de la hoja afectada para que la IA detecte posibles enfermedades."
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="stethoscope" onClick={submit} disabled={enviando}>
            {enviando ? "Analizando…" : "Diagnosticar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-[18px]">
        <Field label="Cultivo (opcional)">
          <Select value={cultivoId} onChange={(e) => setCultivoId(e.target.value)}>
            <option value="">Sin asociar a un cultivo</option>
            {cultivos.map((c) => (
              <option key={c.id} value={c.id}>
                {cultivoNombre(c)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Parte de la planta afectada (opcional)">
          <Select value={parte} onChange={(e) => setParte(e.target.value)}>
            <option value="">Sin especificar</option>
            {PARTES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Foto de la planta">
          <ImageUpload
            key={open ? "open" : "closed"}
            height={180}
            label="Arrastra una foto de la hoja o haz clic para subirla"
            onChange={setFoto}
          />
        </Field>
      </div>
    </Modal>
  );
}
