import { useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "../components/ui/Confirm.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import {
  Button,
  Card,
  EmptyState,
  Field,
  ImageUpload,
  Input,
  PageHeader,
  SearchInput,
  Select,
  Textarea,
} from "../components/ui/primitives.jsx";
import Icon from "../components/ui/Icon.jsx";
import { notificacionesAdminApi } from "../lib/resources.js";

const EMPTY_FORM = {
  title: "",
  body: "",
  audienceType: "specific",
  recipientIds: [],
  targetUrl: "/",
};

const AUDIENCES = [
  { id: "specific", label: "Un usuario", description: "Selecciona una sola persona." },
  { id: "selected", label: "Algunos usuarios", description: "Marca varias personas." },
  { id: "all", label: "Todos", description: "Incluye a todos los usuarios activos." },
];

const ROLE_LABEL = {
  admin: "Superadministrador",
  productor: "Productor",
  consumidor: "Consumidor",
};

const STATUS_LABEL = {
  queued: "En cola",
  sent: "Enviada",
  partial: "Entrega parcial",
  no_subscriptions: "Sin dispositivos activos",
};

export default function NotificacionesAdmin() {
  const toast = useToast();
  const confirm = useConfirm();
  const composerRef = useRef(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [recipients, setRecipients] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [query, setQuery] = useState("");
  const [image, setImage] = useState("");
  const [imageKey, setImageKey] = useState(0);
  const [reuseImageFrom, setReuseImageFrom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [people, history] = await Promise.all([
        notificacionesAdminApi.recipients(),
        notificacionesAdminApi.campaigns(),
      ]);
      setRecipients(people);
      setCampaigns(history);
    } catch (error) {
      toast(error?.response?.data?.detail || "No se pudo cargar el centro de notificaciones", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredRecipients = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return recipients;
    return recipients.filter((person) =>
      `${person.nombre} ${person.email} ${ROLE_LABEL[person.rol] || person.rol}`.toLowerCase().includes(term)
    );
  }, [query, recipients]);

  const selected = useMemo(
    () => recipients.filter((person) => form.recipientIds.includes(person.id)),
    [recipients, form.recipientIds]
  );
  const activeSubscriptions = recipients.filter((person) => person.has_subscription).length;

  const chooseAudience = (audienceType) => {
    setForm((current) => ({ ...current, audienceType, recipientIds: [] }));
    setQuery("");
  };

  const toggleRecipient = (userId) => {
    setForm((current) => {
      if (current.audienceType === "specific") return { ...current, recipientIds: [userId] };
      const exists = current.recipientIds.includes(userId);
      return {
        ...current,
        recipientIds: exists
          ? current.recipientIds.filter((id) => id !== userId)
          : [...current.recipientIds, userId],
      };
    });
  };

  const resetComposer = () => {
    setForm(EMPTY_FORM);
    setImage("");
    setReuseImageFrom(null);
    setImageKey((value) => value + 1);
    setQuery("");
  };

  const reuse = (campaign, keepAudience) => {
    setForm({
      title: campaign.title,
      body: campaign.body,
      audienceType: keepAudience ? campaign.audience_type : "specific",
      recipientIds: keepAudience && campaign.audience_type !== "all" ? campaign.recipient_ids : [],
      targetUrl: campaign.target_url || "/",
    });
    setImage(campaign.image_url || "");
    setReuseImageFrom(campaign.image_url ? campaign.id : null);
    setImageKey((value) => value + 1);
    setLastSent(null);
    setQuery("");
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const send = async () => {
    const title = form.title.trim();
    const body = form.body.trim();
    if (title.length < 2 || body.length < 2) {
      toast("Escribe el titulo y el mensaje", "danger");
      return;
    }
    if (form.audienceType !== "all" && !form.recipientIds.length) {
      toast(form.audienceType === "specific" ? "Selecciona un usuario" : "Selecciona al menos un usuario", "danger");
      return;
    }

    const intendedCount = form.audienceType === "all" ? recipients.length : form.recipientIds.length;
    if (form.audienceType !== "specific") {
      const accepted = await confirm({
        tone: "primary",
        question: `Enviar esta notificacion a ${intendedCount} usuarios?`,
        message: "La campaña quedara registrada en el historial y se enviara a cada dispositivo habilitado.",
        confirmLabel: "Si, enviar",
      });
      if (!accepted) return;
    }

    setSending(true);
    try {
      const result = await notificacionesAdminApi.send({
        title,
        body,
        audience_type: form.audienceType,
        recipient_ids: form.audienceType === "all" ? [] : form.recipientIds,
        target_url: form.targetUrl,
        image_data_url: image.startsWith("data:") ? image : null,
        reuse_image_from: !image.startsWith("data:") && image ? reuseImageFrom : null,
      });
      const snapshot = {
        ...form,
        title,
        body,
        id: result.id,
        image_url: result.image_url,
        recipient_ids: [...form.recipientIds],
        audience_type: form.audienceType,
        target_url: form.targetUrl,
      };
      setLastSent({ ...result, campaign: snapshot });
      toast("Notificacion puesta en cola");
      resetComposer();
      const history = await notificacionesAdminApi.campaigns();
      setCampaigns(history);
    } catch (error) {
      toast(error?.response?.data?.detail || "No se pudo enviar la notificacion", "danger");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="animate-fade" ref={composerRef}>
      <PageHeader
        title="Centro de notificaciones"
        subtitle="Redacta avisos y elige con precision quienes deben recibirlos."
      />

      {lastSent && (
        <section className="mb-5 rounded-2xl border border-[#bdd7bd] bg-[#edf7eb] p-4 sm:p-5" aria-live="polite">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-primary text-white"><Icon name="check" /></span>
              <div>
                <h2 className="text-base font-extrabold text-text">La notificacion esta en cola</h2>
                <p className="mt-1 text-sm text-muted-2">
                  {lastSent.recipient_count} destinatarios, {lastSent.subscribed_recipient_count} con dispositivos habilitados.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="sm" variant="secondary" icon="refresh" onClick={() => reuse(lastSent.campaign, true)}>Reutilizar igual</Button>
              <Button size="sm" icon="users" onClick={() => reuse(lastSent.campaign, false)}>Enviar a otros</Button>
            </div>
          </div>
        </section>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.75fr)]">
        <Card pad="p-4 sm:p-6">
          <div className="mb-5 flex items-center gap-3 border-b border-line pb-4">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-50 text-primary"><Icon name="megaphone" /></span>
            <div><h2 className="text-lg font-extrabold text-text">Nueva notificacion</h2><p className="mt-1 text-sm text-muted-2">El permiso del usuario siempre sigue siendo opcional.</p></div>
          </div>

          <div className="grid gap-5">
            <Field label="Titulo">
              <Input
                value={form.title}
                maxLength={120}
                placeholder="Ej: Jornada de capacitacion este sabado"
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              />
              <CharacterCount value={form.title} max={120} />
            </Field>
            <Field label="Mensaje">
              <Textarea
                value={form.body}
                maxLength={500}
                rows={5}
                placeholder="Escribe la informacion principal que recibiran los usuarios."
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              />
              <CharacterCount value={form.body} max={500} />
            </Field>

            <fieldset className="grid gap-3">
              <legend className="mb-1 text-[13.5px] font-bold text-text">Destinatarios</legend>
              <div className="grid gap-2 md:grid-cols-3">
                {AUDIENCES.map((audience) => {
                  const active = form.audienceType === audience.id;
                  return (
                    <button
                      key={audience.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => chooseAudience(audience.id)}
                      className={`min-h-[74px] rounded-xl border p-3 text-left transition-colors ${active ? "border-primary bg-accent-50" : "border-line bg-white hover:bg-chip-3"}`}
                    >
                      <span className="block text-sm font-extrabold text-text">{audience.label}</span>
                      <span className="mt-1 block text-xs leading-4 text-muted-2">{audience.description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {form.audienceType === "all" ? (
              <div className="rounded-xl border border-line bg-chip-2 p-4">
                <div className="flex items-start gap-3">
                  <Icon name="users" className="mt-0.5 flex-shrink-0 text-primary" />
                  <div><p className="font-extrabold text-text">{recipients.length} usuarios activos</p><p className="mt-1 text-sm leading-5 text-muted-2">{activeSubscriptions} tienen al menos un dispositivo preparado para recibir Web Push.</p></div>
                </div>
              </div>
            ) : (
              <RecipientPicker
                loading={loading}
                recipients={filteredRecipients}
                selectedIds={form.recipientIds}
                multiple={form.audienceType === "selected"}
                query={query}
                onQuery={setQuery}
                onToggle={toggleRecipient}
              />
            )}

            {selected.length > 0 && form.audienceType !== "all" && (
              <p className="-mt-2 text-sm font-bold text-primary">
                {selected.length === 1 ? selected[0].nombre : `${selected.length} usuarios seleccionados`}
              </p>
            )}

            <Field label="Pantalla que se abrira">
              <Select value={form.targetUrl} onChange={(event) => setForm((current) => ({ ...current, targetUrl: event.target.value }))}>
                <option value="/">Inicio segun el rol</option>
                <option value="/alertas">Alertas</option>
                <option value="/cuidados">Cuidados</option>
                <option value="/mercado">Mercado</option>
              </Select>
            </Field>

            <Field label="Imagen opcional" hint="JPG, PNG o WebP. Se optimiza antes de enviar y no debe superar 2 MB.">
              <ImageUpload
                key={imageKey}
                defaultUrl={image}
                height={190}
                label="Adjuntar imagen a la notificacion"
                hint="La vista puede variar segun el dispositivo"
                onChange={(value) => {
                  setImage(value);
                  if (value !== image) setReuseImageFrom(null);
                }}
              />
            </Field>

            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={resetComposer} disabled={sending}>Limpiar</Button>
              <Button icon="bell" onClick={send} disabled={sending || loading}>
                {sending ? "Enviando..." : "Enviar notificacion"}
              </Button>
            </div>
          </div>
        </Card>

        <NotificationPreview title={form.title} body={form.body} image={image} />
      </div>

      <History campaigns={campaigns} loading={loading} onReuse={reuse} />
    </div>
  );
}

function CharacterCount({ value, max }) {
  return <span className="-mt-1 text-right text-xs font-semibold text-muted-2">{value.length}/{max}</span>;
}

function RecipientPicker({ loading, recipients, selectedIds, multiple, query, onQuery, onToggle }) {
  return (
    <div className="rounded-xl border border-line bg-chip-3 p-3 sm:p-4">
      <SearchInput placeholder="Buscar por nombre, correo o rol" value={query} onChange={(event) => onQuery(event.target.value)} />
      <div className="mt-3 max-h-[300px] overflow-y-auto rounded-xl border border-line bg-white">
        {loading ? (
          <div className="grid gap-2 p-3" aria-label="Cargando destinatarios">
            {[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-chip" />)}
          </div>
        ) : recipients.length ? recipients.map((person) => {
          const selected = selectedIds.includes(person.id);
          return (
            <button
              type="button"
              key={person.id}
              onClick={() => onToggle(person.id)}
              className={`flex min-h-[62px] w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 ${selected ? "bg-accent-50" : "hover:bg-chip-3"}`}
            >
              <span className={`grid h-6 w-6 flex-shrink-0 place-items-center border text-xs font-extrabold ${multiple ? "rounded-md" : "rounded-full"} ${selected ? "border-primary bg-primary text-white" : "border-line-2 bg-white text-transparent"}`}>
                <Icon name="check" size={14} stroke={3} />
              </span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-text">{person.nombre}</span><span className="block truncate text-xs text-muted-2">{person.email} | {ROLE_LABEL[person.rol] || person.rol}</span></span>
              <span className={`hidden rounded-lg px-2 py-1 text-[11px] font-bold sm:block ${person.has_subscription ? "bg-[#e3f1df] text-[#2f6b34]" : "bg-chip text-muted-2"}`}>
                {person.has_subscription ? "Push activo" : "Sin dispositivo"}
              </span>
            </button>
          );
        }) : (
          <div className="p-6 text-center text-sm font-semibold text-muted-2">No hay usuarios que coincidan.</div>
        )}
      </div>
    </div>
  );
}

function NotificationPreview({ title, body, image }) {
  return (
    <Card pad="p-4 sm:p-5" className="xl:sticky xl:top-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-extrabold text-text"><Icon name="eye" size={18} /> Vista previa aproximada</div>
      <div className="overflow-hidden rounded-2xl border border-line bg-[#f9fbf8] shadow-[0_12px_30px_rgba(27,77,46,.10)]">
        {image && <img src={image} alt="Imagen adjunta a la notificacion" className="h-40 w-full object-cover" />}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-primary text-white"><Icon name="bell" size={19} /></span>
            <div className="min-w-0"><p className="text-xs font-bold text-muted-2">Biohuerto Inteligente</p><h3 className="mt-1 break-words text-[15px] font-extrabold text-text">{title || "Titulo de la notificacion"}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-muted-1">{body || "Aqui aparecera el mensaje que recibiran los usuarios."}</p></div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-2">La imagen y la extension del texto dependen del sistema operativo y del navegador.</p>
    </Card>
  );
}

function History({ campaigns, loading, onReuse }) {
  return (
    <section className="mt-7">
      <div className="mb-4"><h2 className="text-xl font-extrabold text-primary">Historial de envios</h2><p className="mt-1 text-sm text-muted-2">Revisa resultados y reutiliza cualquier mensaje.</p></div>
      {loading ? (
        <div className="grid gap-3"><div className="h-28 animate-pulse rounded-2xl bg-white" /><div className="h-28 animate-pulse rounded-2xl bg-white" /></div>
      ) : campaigns.length === 0 ? (
        <EmptyState icon="bell" title="Todavia no hay envios" desc="La primera notificacion aparecera aqui con sus destinatarios y estado." />
      ) : (
        <div className="grid gap-3">
          {campaigns.map((campaign) => (
            <article key={campaign.id} className="rounded-2xl border border-line bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                {campaign.image_url && <img src={campaign.image_url} alt="" className="h-20 w-full rounded-xl object-cover sm:w-28" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-extrabold text-text">{campaign.title}</h3><span className="rounded-lg bg-chip px-2 py-1 text-[11px] font-bold text-muted-1">{STATUS_LABEL[campaign.status] || campaign.status}</span></div>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-1">{campaign.body}</p>
                  <p className="mt-2 text-xs font-semibold text-muted-2">{formatDate(campaign.created_at)} | {campaign.recipient_count} destinatarios | {campaign.subscribed_recipient_count} con Push</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                  <Button size="sm" variant="secondary" icon="refresh" onClick={() => onReuse(campaign, true)}>Reutilizar igual</Button>
                  <Button size="sm" variant="ghost" icon="users" onClick={() => onReuse(campaign, false)}>Enviar a otros</Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value) {
  if (!value) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
