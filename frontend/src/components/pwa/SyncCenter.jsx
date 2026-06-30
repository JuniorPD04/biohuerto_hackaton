import { useEffect, useMemo, useState } from "react";
import Icon from "../ui/Icon.jsx";
import { useOffline } from "../../context/OfflineContext.jsx";
import { disableNotifications, enableNotifications, isIos, isStandalone } from "../../lib/notifications.js";
import { useToast } from "../ui/Toast.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { disableLocalSecurity, enableBiometric, getLocalSecurity, setLocalPin } from "../../lib/localSecurity.js";
import { listConflicts, resolveConflict } from "../../db/offlineStore.js";
import { getLocalNotificationPreferences, saveLocalNotificationPreferences } from "../../db/offlineStore.js";
import { api } from "../../lib/api.js";

export default function SyncCenter() {
  const offline = useOffline();
  const toast = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(
    () => ("Notification" in window ? Notification.permission : "unsupported")
  );
  const [pin, setPin] = useState("");
  const [securityMode, setSecurityMode] = useState(() => user?.id ? getLocalSecurity(user.id).mode : "none");
  const [conflictRows, setConflictRows] = useState([]);
  const [notificationPrefs, setNotificationPrefs] = useState({ alertas_altas: true, cuidados: true, conflictos: true, sincronizacion: false });

  useEffect(() => {
    const capture = (event) => { event.preventDefault(); setInstallEvent(event); };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  useEffect(() => {
    if (open && offline.conflicts) listConflicts().then(setConflictRows).catch(() => setConflictRows([]));
    else if (!offline.conflicts) setConflictRows([]);
  }, [offline.conflicts, open]);

  useEffect(() => {
    if (!open) return;
    getLocalNotificationPreferences().then(setNotificationPrefs).catch(() => {});
    if (offline.online) api.get("/api/notifications/preferences").then(({ data }) => setNotificationPrefs(data)).catch(() => {});
  }, [offline.online, open]);

  const state = useMemo(() => {
    if (!offline.online) return { label: "Sin conexion", tone: "bg-[#9a5a23]", icon: "wifi" };
    if (offline.conflicts) return { label: `${offline.conflicts} conflicto(s)`, tone: "bg-[#b23a2e]", icon: "alertTri" };
    if (offline.syncing) return { label: "Sincronizando", tone: "bg-[#2f8754]", icon: "refresh" };
    if (offline.pending) return { label: `${offline.pending} pendiente(s)`, tone: "bg-[#9a5a23]", icon: "refresh" };
    return { label: "Al dia", tone: "bg-[#2f8754]", icon: "checkCircle" };
  }, [offline.conflicts, offline.online, offline.pending, offline.syncing]);

  const askNotifications = async () => {
    try {
      const result = await enableNotifications();
      setNotificationPermission(result.permission);
      if (result.permission === "granted") {
        toast(result.localOnly ? "Avisos locales activados" : "Notificaciones activadas");
      }
    } catch (error) {
      toast(error.message, "danger");
    }
  };

  const turnOffNotifications = async () => {
    try { await disableNotifications(); } catch { /* puede estar offline */ }
    toast("Notificaciones desactivadas");
  };

  const toggleNotificationPreference = async (key) => {
    const next = { ...notificationPrefs, [key]: !notificationPrefs[key] };
    setNotificationPrefs(next);
    await saveLocalNotificationPreferences(next).catch(() => {});
    if (offline.online) api.put("/api/notifications/preferences", next).catch(() => toast("La preferencia se enviara al reconectar", "danger"));
  };

  const install = async () => {
    if (installEvent) {
      await installEvent.prompt();
      setInstallEvent(null);
      return;
    }
    toast(isIos() ? "En Safari, usa Compartir y luego Agregar a inicio" : "Usa el menu del navegador para instalar Biohuerto");
  };

  const savePin = async () => {
    try {
      await setLocalPin(user.id, pin);
      setPin("");
      setSecurityMode("pin");
      toast("PIN local configurado");
    } catch (error) { toast(error.message, "danger"); }
  };

  const saveBiometric = async () => {
    try {
      await enableBiometric(user.id, user.nombre);
      setSecurityMode("biometric");
      toast("Biometria configurada");
    } catch (error) { toast(error.message, "danger"); }
  };

  const removeSecurity = () => {
    disableLocalSecurity(user.id);
    setSecurityMode("none");
    toast("Bloqueo local desactivado");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold text-white ${state.tone}`}
      >
        <Icon name={state.icon} size={16} />
        <span>{state.label}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end bg-[rgba(18,30,22,.48)] md:items-center md:justify-center" onClick={() => setOpen(false)}>
          <section
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-[20px] bg-bg p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-modal md:max-w-lg md:rounded-[20px] md:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-extrabold text-text">Conexion y dispositivo</h2>
                <p className="mt-1 text-sm text-muted-2">Controla datos offline, instalacion y avisos.</p>
              </div>
              <button className="grid h-11 w-11 place-items-center rounded-xl hover:bg-chip" onClick={() => setOpen(false)}><Icon name="x" /></button>
            </div>

            <div className="mt-6 grid gap-3">
              <InfoRow label="Servidor" value={offline.online ? "Conectado" : "Sin conexion"} />
              <InfoRow label="SQLite local" value={offline.persistent ? "Persistente" : "Temporal"} />
              <InfoRow label="Cambios pendientes" value={String(offline.pending)} />
              <InfoRow label="Conflictos" value={String(offline.conflicts)} danger={offline.conflicts > 0} />
              <InfoRow label="Ultima sincronizacion" value={offline.lastSync ? offline.lastSync.toLocaleTimeString("es-PE") : "Aun no realizada"} />
            </div>

            {offline.error && <p className="mt-4 rounded-xl bg-[#fff1ef] p-3 text-sm font-semibold text-[#9b3026]">{offline.error}</p>}

            {conflictRows.length > 0 && (
              <div className="mt-5 rounded-2xl border border-[#e7b8b2] bg-[#fff8f7] p-4">
                <h3 className="font-extrabold text-[#8e2f27]">Conflictos por resolver</h3>
                <div className="mt-3 grid gap-3">
                  {conflictRows.map((row) => (
                    <div key={row.operation_id} className="rounded-xl bg-white p-3">
                      <p className="text-sm font-extrabold text-text">{row.entity_type}: {row.record_id.slice(0, 8)}</p>
                      <p className="mt-1 text-xs text-muted-2">El registro cambio tambien en el servidor.</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button className="min-h-11 rounded-xl border border-line-2 text-sm font-extrabold text-muted-1" onClick={async () => { await resolveConflict(row.operation_id, "server"); await offline.synchronize({ quiet: true }); }}>Usar servidor</button>
                        <button className="min-h-11 rounded-xl bg-primary text-sm font-extrabold text-white" onClick={async () => { await resolveConflict(row.operation_id, "local"); await offline.synchronize(); }}>Usar mi version</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-extrabold text-white disabled:opacity-50"
              disabled={!offline.online || offline.syncing}
              onClick={() => offline.synchronize()}
            >
              <Icon name="refresh" /> {offline.syncing ? "Sincronizando" : "Sincronizar ahora"}
            </button>

            {!isStandalone() && (
              <button className="mt-3 min-h-11 w-full rounded-xl border border-line-2 bg-white px-4 font-extrabold text-primary" onClick={install}>
                Instalar Biohuerto
              </button>
            )}

            <div className="mt-6 border-t border-line pt-5">
              <h3 className="font-extrabold text-text">Notificaciones</h3>
              <p className="mt-1 text-sm leading-6 text-muted-2">
                Recibe alertas importantes y recordatorios. El permiso es opcional y solo se solicita al pulsar el boton.
              </p>
              {isIos() && !isStandalone() && (
                <p className="mt-3 rounded-xl bg-chip-2 p-3 text-sm text-muted-1">En iPhone, instala primero la app desde Compartir y Agregar a inicio.</p>
              )}
              {notificationPermission !== "granted" ? (
                <button className="mt-4 min-h-11 w-full rounded-xl bg-accent-700 px-4 font-extrabold text-white" onClick={askNotifications}>
                  Activar notificaciones
                </button>
              ) : (
                <button className="mt-4 min-h-11 w-full rounded-xl border border-line-2 bg-white px-4 font-extrabold text-muted-1" onClick={turnOffNotifications}>
                  Desactivar notificaciones
                </button>
              )}
              <div className="mt-4 grid gap-2">
                {[
                  ["alertas_altas", "Alertas de prioridad alta"],
                  ["cuidados", "Cuidados proximos o vencidos"],
                  ["conflictos", "Conflictos de sincronizacion"],
                  ["sincronizacion", "Sincronizaciones completadas"],
                ].map(([key, label]) => (
                  <label key={key} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-text">
                    {label}
                    <input type="checkbox" checked={Boolean(notificationPrefs[key])} onChange={() => toggleNotificationPreference(key)} className="h-5 w-5 accent-[#1f7a3d]" />
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <h3 className="font-extrabold text-text">Seguridad local</h3>
              <p className="mt-1 text-sm leading-6 text-muted-2">Opcional. Bloquea la PWA al abrirla y tras 15 minutos inactiva.</p>
              {securityMode === "none" ? (
                <>
                  <div className="mt-4 flex gap-2">
                    <input aria-label="Nuevo PIN" inputMode="numeric" type="password" placeholder="PIN de 4 a 8 digitos" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-2 px-3 text-base outline-none focus:border-primary" />
                    <button className="min-h-11 rounded-xl bg-primary px-4 font-extrabold text-white" onClick={savePin}>Guardar</button>
                  </div>
                  <button className="mt-3 min-h-11 w-full rounded-xl border border-line-2 bg-white px-4 font-extrabold text-primary" onClick={saveBiometric}>Usar biometria</button>
                </>
              ) : (
                <div className="mt-4 flex items-center justify-between rounded-xl bg-white p-4">
                  <span className="text-sm font-extrabold text-text">{securityMode === "pin" ? "PIN activo" : "Biometria activa"}</span>
                  <button className="min-h-11 px-3 text-sm font-extrabold text-[#b23a2e]" onClick={removeSecurity}>Desactivar</button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function InfoRow({ label, value, danger = false }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 rounded-xl bg-white px-4 py-3">
      <span className="text-sm font-semibold text-muted-2">{label}</span>
      <span className={`text-sm font-extrabold ${danger ? "text-[#b23a2e]" : "text-text"}`}>{value}</span>
    </div>
  );
}
