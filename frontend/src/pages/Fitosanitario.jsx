import { useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  EmptyState,
  Card,
  Button,
  Badge,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  Icon,
  ImageUpload,
} from "../components/ui/primitives.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import { fmtFecha } from "../lib/theme.js";
import { diagnosticoApi, cultivosApi } from "../lib/resources.js";

const PARTES = ["Hoja", "Fruto", "Tallo", "Raíz", "Planta completa"];

// Catálogo de síntomas frecuentes en biohuertos (diagnóstico guiado).
const SINTOMAS_CATALOGO = [
  "Manchas en las hojas",
  "Hojas amarillas (clorosis)",
  "Hojas marchitas o caídas",
  "Polvo blanco (oídio)",
  "Manchas marrones o negras",
  "Anillos concéntricos en las manchas",
  "Agujeros o mordeduras",
  "Insectos visibles",
  "Pulgones o cochinilla",
  "Hojas enrolladas o deformes",
  "Pudrición (tallo, raíz o fruto)",
  "Moho, telaraña o tela blanca",
  "Crecimiento lento o enanismo",
  "Bordes de hojas quemados",
];

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
        subtitle="Diagnostica con IA por foto de la hoja o respondiendo sobre los síntomas observados."
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
          desc="Registra un nuevo diagnóstico: sube una foto del cultivo o responde sobre los síntomas que observas."
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
  const [modo, setModo] = useState("imagen"); // "imagen" | "guiado"
  const [cultivoId, setCultivoId] = useState("");
  const [especie, setEspecie] = useState("");
  const [parte, setParte] = useState("Hoja");
  const [foto, setFoto] = useState("");
  // Estado del diagnóstico guiado
  const [sintomas, setSintomas] = useState([]);
  const [otroSintoma, setOtroSintoma] = useState("");
  const [zona, setZona] = useState("");
  const [tiempo, setTiempo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) {
      setModo("imagen");
      setCultivoId("");
      setEspecie("");
      setParte("Hoja");
      setFoto("");
      setSintomas([]);
      setOtroSintoma("");
      setZona("");
      setTiempo("");
      setObservaciones("");
    }
  }, [open]);

  const toggleSintoma = (s) =>
    setSintomas((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Especie: del cultivo seleccionado o, si no hay, del campo de texto.
  const cultivoSel = cultivos.find((c) => String(c.id) === String(cultivoId));
  const especieFinal = cultivoSel ? cultivoSel.especie : especie.trim();

  const submitImagen = async () => {
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

  const submitGuiado = async () => {
    if (especieFinal.length < 2) {
      toast("Selecciona el cultivo o escribe la especie", "danger");
      return;
    }
    const todos = [...sintomas];
    if (otroSintoma.trim()) todos.push(otroSintoma.trim());
    if (todos.length === 0) {
      toast("Selecciona al menos un síntoma", "danger");
      return;
    }
    setEnviando(true);
    try {
      await diagnosticoApi.guiado({
        cultivo_id: cultivoId || null,
        especie: especieFinal,
        parte_planta: parte || "Hoja",
        sintomas: todos,
        zona_afectada: zona.trim() || null,
        tiempo_dias: tiempo === "" ? null : Number(tiempo),
        observaciones_previas: observaciones.trim() || null,
      });
      toast("Diagnóstico guiado generado correctamente");
      onCreated();
    } catch {
      toast("No se pudo generar el diagnóstico ahora. Inténtalo más tarde.", "danger");
    } finally {
      setEnviando(false);
    }
  };

  const esImagen = modo === "imagen";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo diagnóstico"
      subtitle="Elige cómo diagnosticar: subiendo una foto o respondiendo sobre los síntomas."
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon="stethoscope"
            onClick={esImagen ? submitImagen : submitGuiado}
            disabled={enviando}
          >
            {enviando
              ? esImagen
                ? "Analizando imagen…"
                : "Analizando síntomas…"
              : "Diagnosticar"}
          </Button>
        </>
      }
    >
      <div className="grid gap-[18px]">
        {/* Selector de modo */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-chip p-[5px]">
          {[
            { id: "imagen", icon: "camera", label: "Por foto" },
            { id: "guiado", icon: "clipboard", label: "Guiado por síntomas" },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModo(m.id)}
              className={`inline-flex items-center justify-center gap-2 rounded-[9px] py-[10px] text-[14px] font-bold transition-all ${
                modo === m.id
                  ? "bg-white text-primary shadow-[0_1px_3px_rgba(20,40,30,.12)]"
                  : "bg-transparent text-muted-2"
              }`}
            >
              <Icon name={m.icon} size={17} />
              {m.label}
            </button>
          ))}
        </div>

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

        {/* En guiado, si no hay cultivo, pedir la especie a mano */}
        {!esImagen && !cultivoId && (
          <Field label="Especie / cultivo" hint="Necesario para el diagnóstico guiado.">
            <Input
              value={especie}
              onChange={(e) => setEspecie(e.target.value)}
              placeholder="Ej: Tomate, Lechuga, Ají…"
            />
          </Field>
        )}

        <Field label={esImagen ? "Parte de la planta afectada (opcional)" : "Parte de la planta afectada"}>
          <Select value={parte} onChange={(e) => setParte(e.target.value)}>
            {esImagen && <option value="">Sin especificar</option>}
            {PARTES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>

        {esImagen ? (
          <Field label="Foto de la planta">
            <ImageUpload
              key={open ? "open" : "closed"}
              height={180}
              label="Arrastra una foto de la hoja o haz clic para subirla"
              onChange={setFoto}
            />
          </Field>
        ) : (
          <>
            <Field label="¿Qué síntomas observas?" hint="Selecciona todos los que apliquen.">
              <div className="flex flex-wrap gap-2">
                {SINTOMAS_CATALOGO.map((s) => {
                  const on = sintomas.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSintoma(s)}
                      className={`rounded-full border px-[13px] py-[7px] text-[13px] font-semibold transition-colors ${
                        on
                          ? "border-primary bg-accent-50 text-primary"
                          : "border-line bg-white text-muted-1 hover:bg-chip"
                      }`}
                    >
                      {on && <Icon name="check" size={13} stroke={2.6} className="mr-1 inline align-middle" />}
                      {s}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Otro síntoma (opcional)">
              <Input
                value={otroSintoma}
                onChange={(e) => setOtroSintoma(e.target.value)}
                placeholder="Describe otro síntoma que no esté en la lista"
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Zona / ubicación del daño (opcional)">
                <Input
                  value={zona}
                  onChange={(e) => setZona(e.target.value)}
                  placeholder="Ej: hojas inferiores, bordes…"
                />
              </Field>
              <Field label="¿Hace cuántos días? (opcional)">
                <Input
                  type="number"
                  min="0"
                  value={tiempo}
                  onChange={(e) => setTiempo(e.target.value)}
                  placeholder="Ej: 5"
                />
              </Field>
            </div>

            <Field label="Observaciones adicionales (opcional)">
              <Textarea
                rows={3}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Riego, clima reciente, si afecta a varias plantas, etc."
              />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
