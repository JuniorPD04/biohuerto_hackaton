import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  IconBtn,
  Input,
  PageHeader,
  Toggle,
} from "../components/ui/primitives.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import { ragApi } from "../lib/resources.js";

function fmtDateTime(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceFromFile(file) {
  return (file?.name || "").replace(/\.pdf$/i, "").trim();
}

export default function Rag() {
  const { user } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const [file, setFile] = useState(null);
  const [fuente, setFuente] = useState("");
  const [reemplazar, setReemplazar] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setStatus(await ragApi.status());
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo cargar el estado RAG", "danger");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.rol === "admin") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.rol]);

  const pickFile = (nextFile) => {
    if (!nextFile) return;
    const isPdf = nextFile.type === "application/pdf" || nextFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast("Selecciona un archivo PDF", "danger");
      return;
    }
    setFile(nextFile);
    if (!fuente.trim()) setFuente(sourceFromFile(nextFile));
  };

  const submit = async () => {
    if (!file) {
      toast("Selecciona un PDF para subir", "danger");
      return;
    }
    setUploading(true);
    try {
      const res = await ragApi.uploadPdf({ file, fuente: fuente.trim(), reemplazar });
      toast(res.replaced ? "Fuente RAG reemplazada" : "Documento RAG cargado");
      setFile(null);
      setFuente("");
      setReemplazar(false);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo procesar el PDF", "danger");
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await ragApi.removeFuente(toDelete.fuente);
      toast(`${res.deleted_chunks} chunks eliminados`);
      setToDelete(null);
      await load();
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo eliminar la fuente RAG", "danger");
    } finally {
      setDeleting(false);
    }
  };

  if (user?.rol !== "admin") {
    return (
      <div className="animate-fade">
        <PageHeader title="Base RAG" subtitle="Administracion de documentos para recomendaciones." />
        <EmptyState icon="ban" title="Acceso restringido" desc="Solo un administrador puede cargar documentos RAG." />
      </div>
    );
  }

  const fuentes = status?.fuentes || [];
  const maxMb = status?.upload_max_mb || 25;

  return (
    <div className="animate-fade">
      <PageHeader
        title="Base RAG"
        subtitle="Carga documentos PDF, conviertelos a Markdown y vectorizalos en pgvector."
        action={
          <Button variant="secondary" icon="refresh" onClick={load} disabled={loading || uploading}>
            Actualizar
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Metric icon="archive" label="Fuentes" value={status?.total_fuentes ?? 0} />
        <Metric icon="list" label="Chunks activos" value={status?.total_chunks ?? 0} />
        <Metric icon="database" label="Embedding" value={status?.embedding_model || "No configurado"} compact />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
        <Card pad="p-[26px]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-[21px] font-extrabold text-text">Subida de documento</h2>
              <p className="mt-1 text-[14px] text-muted-2">PDF a Markdown antes de generar embeddings.</p>
            </div>
            <Badge bg="#dcefd7" fg="#2f6b34" dot="#3f9a48">MarkItDown</Badge>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            className={`cursor-pointer rounded-[16px] border-2 border-dashed px-6 py-8 text-center transition-colors ${
              over ? "border-primary bg-accent-50" : "border-line-2 bg-chip-3"
            }`}
          >
            <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[14px] bg-white text-primary shadow-[0_1px_4px_rgba(20,40,30,.08)]">
              <Icon name={file ? "checkCircle" : "upload"} size={26} />
            </span>
            <div className="text-[16px] font-extrabold text-text">
              {file ? file.name : "Seleccionar PDF"}
            </div>
            <div className="mt-1 text-[13px] font-semibold text-muted-2">
              {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : `Maximo ${maxMb} MB`}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <Field label="Nombre de fuente">
              <Input
                value={fuente}
                onChange={(e) => setFuente(e.target.value)}
                placeholder="Ej: Manual biohuerto organico"
              />
            </Field>
            <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-[11px]">
              <Toggle on={reemplazar} onClick={() => setReemplazar((v) => !v)} title="Reemplazar fuente existente" />
              <span className="whitespace-nowrap text-[14px] font-bold text-muted-1">Reemplazar</span>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <div className="flex flex-wrap gap-2">
              <Badge bg="#e7eefb" fg="#33559e" dot="#5b7fd6">PDF</Badge>
              <Badge bg="#fbf0c9" fg="#8a6b16" dot="#e2b53a">Markdown</Badge>
              <Badge bg="#d7efe9" fg="#1f7a5e" dot="#2fa07e">pgvector</Badge>
            </div>
            <Button icon="upload" onClick={submit} disabled={uploading || !file}>
              {uploading ? "Procesando..." : "Subir PDF"}
            </Button>
          </div>
        </Card>

        <Card pad="p-[26px]">
          <h2 className="m-0 text-[21px] font-extrabold text-text">Estado RAG</h2>
          <p className="mt-1 text-[14px] text-muted-2">Fuentes disponibles para recuperacion semantica.</p>

          <div className="mt-5 grid gap-3">
            <StatusRow icon="database" label="Vector store" value="PostgreSQL + pgvector" />
            <StatusRow icon="clipboard" label="Conversor" value={status?.conversor_pdf || "Microsoft MarkItDown"} />
            <StatusRow icon="bulb" label="OpenRouter" value={status?.llm_model || "Modelo no configurado"} />
          </div>

          <div className="mt-6 rounded-[14px] border border-line bg-chip-3 p-4">
            <div className="mb-2 text-[12px] font-extrabold uppercase tracking-[.06em] text-muted-2">
              Flujo activo
            </div>
            <div className="grid gap-2 text-[14px] font-semibold text-muted-1">
              <FlowStep n="1" text="Conversion del PDF a Markdown" />
              <FlowStep n="2" text="Fragmentacion con solapamiento" />
              <FlowStep n="3" text="Embeddings y busqueda por similitud" />
            </div>
          </div>
        </Card>
      </div>

      <Card pad="p-0" className="overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-line bg-chip-2 px-[26px] py-[18px]">
          <div>
            <h2 className="m-0 text-[19px] font-extrabold text-text">Fuentes vectorizadas</h2>
            <p className="mt-1 text-[13.5px] text-muted-2">Inventario cargado en la tabla de chunks RAG.</p>
          </div>
          <Badge bg="#eef2ec" fg="#46514a">{loading ? "Cargando" : `${fuentes.length} fuentes`}</Badge>
        </div>

        {loading ? (
          <div className="grid place-items-center py-14 text-muted-2">Cargando fuentes...</div>
        ) : fuentes.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="archive" title="Sin fuentes RAG" desc="Sube el primer PDF para alimentar las recomendaciones." />
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[1.5fr_.45fr_.85fr_.85fr_.35fr] gap-4 border-b border-line bg-white px-[26px] py-[13px] text-[11.5px] font-extrabold uppercase tracking-[.06em] text-muted-2">
              <span>Fuente</span>
              <span>Chunks</span>
              <span>Primera carga</span>
              <span>Actualizado</span>
              <span className="text-right">Acciones</span>
            </div>
            {fuentes.map((row) => (
              <div
                key={row.fuente}
                className="grid grid-cols-[1.5fr_.45fr_.85fr_.85fr_.35fr] items-center gap-4 border-b border-line px-[26px] py-[16px] last:border-b-0 hover:bg-chip-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-extrabold text-text">{row.fuente}</div>
                </div>
                <span className="font-mono text-[14px] font-extrabold text-primary">{row.chunks}</span>
                <span className="font-mono text-[12.5px] font-semibold text-muted-2">{fmtDateTime(row.primer_chunk)}</span>
                <span className="font-mono text-[12.5px] font-semibold text-muted-2">{fmtDateTime(row.ultimo_chunk)}</span>
                <div className="flex justify-end">
                  <IconBtn name="trash" title="Eliminar fuente" tone="danger" onClick={() => setToDelete(row)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => (deleting ? null : setToDelete(null))}
        onConfirm={confirmDelete}
        question="Eliminar esta fuente vectorizada?"
        message={
          toDelete
            ? `Se eliminaran ${toDelete.chunks} chunks de "${toDelete.fuente}" en pgvector. Esta accion no se puede deshacer.`
            : ""
        }
        confirmLabel={deleting ? "Eliminando..." : "Eliminar"}
      />
    </div>
  );
}

function Metric({ icon, label, value, compact }) {
  return (
    <Card pad="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13.5px] font-bold text-muted-2">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent-50 text-primary">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <div className={`${compact ? "text-[19px]" : "text-[32px]"} truncate font-extrabold leading-none text-text`}>
        {value}
      </div>
    </Card>
  );
}

function StatusRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-[13px] border border-line bg-white px-4 py-3">
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] bg-accent-50 text-primary">
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-[12px] font-extrabold uppercase tracking-[.05em] text-muted-2">{label}</div>
        <div className="truncate text-[14px] font-bold text-text">{value}</div>
      </div>
    </div>
  );
}

function FlowStep({ n, text }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[9px] bg-white font-mono text-[12px] font-extrabold text-primary">
        {n}
      </span>
      <span>{text}</span>
    </div>
  );
}
