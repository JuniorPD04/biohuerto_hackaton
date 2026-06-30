import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "./AuthContext.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import {
  applySyncResponse,
  cacheBootstrap,
  configureOfflineUser,
  conflictCount,
  getOutbox,
  getSyncCursor,
  getLocalNotificationPreferences,
  outboxCount,
  readRows,
} from "../db/offlineStore.js";
import { getDeviceId } from "../db/crypto.js";
import { requestPersistentStorage, storageEstimate } from "../db/localDb.js";

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const { user, isAuthenticated, offlineSession, refresh } = useAuth();
  const toast = useToast();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [persistent, setPersistent] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState(null);

  const refreshCounts = useCallback(async () => {
    if (!user?.id) return;
    const [queued, conflicted] = await Promise.all([outboxCount(), conflictCount()]);
    setPending(queued);
    setConflicts(conflicted);
  }, [user?.id]);

  const synchronize = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.id || syncingRef.current || !navigator.onLine || offlineSession) return false;
    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    try {
      const [operations, cursor] = await Promise.all([getOutbox(), getSyncCursor()]);
      const { data } = await api.post("/api/sync", {
        device_id: getDeviceId(),
        cursor,
        operations,
      });
      await applySyncResponse(data);
      await refreshCounts();
      setLastSync(new Date());
      if (!quiet && operations.length) toast(`${operations.length} cambio(s) sincronizado(s)`);
      const notificationPrefs = await getLocalNotificationPreferences().catch(() => ({ sincronizacion: false }));
      if (operations.length && notificationPrefs.sincronizacion && document.visibilityState === "hidden" && Notification.permission === "granted") {
        const registration = await navigator.serviceWorker?.ready;
        registration?.showNotification("Biohuerto sincronizado", {
          body: `${operations.length} cambio(s) llegaron al servidor.`,
          icon: "/pwa/icon-192.png",
          tag: "biohuerto-sync-complete",
          data: { url: "/panel" },
        });
      }
      return true;
    } catch (syncError) {
      if (syncError?.response?.status === 401) await refresh();
      setError(syncError?.response?.data?.detail || "Sin conexion con el servidor");
      return false;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [offlineSession, refresh, refreshCounts, toast, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return undefined;
    let cancelled = false;
    (async () => {
      const info = await configureOfflineUser(user.id);
      if (cancelled) return;
      const [persisted, usage] = await Promise.all([
        requestPersistentStorage().catch(() => false),
        storageEstimate().catch(() => null),
      ]);
      setPersistent(Boolean(info?.persistent && persisted));
      setEstimate(usage);
      await refreshCounts();
      if ("Notification" in window && Notification.permission === "granted") {
        const prefs = await getLocalNotificationPreferences().catch(() => ({ cuidados: false }));
        if (prefs.cuidados) {
          const careRows = await readRows("cuidados").catch(() => []);
          const due = careRows.find((care) => {
            const base = new Date(care.ultima_realizada || care.created_at || 0).getTime();
            return base && base + Number(care.frecuencia_dias || 0) * 86400000 <= Date.now();
          });
          if (due) {
            const registration = await navigator.serviceWorker?.ready;
            registration?.showNotification("Cuidado pendiente", {
              body: due.descripcion || "Revisa los cuidados programados de tu cultivo.",
              icon: "/pwa/icon-192.png", tag: `cuidado-${due.id}`, data: { url: "/cuidados" },
            });
          }
        }
      }
      if (navigator.onLine && !offlineSession) {
        try {
          const { data } = await api.get("/api/sync/bootstrap");
          await cacheBootstrap(data);
        } catch {
          // El cache existente sigue siendo util si bootstrap no esta disponible.
        }
        await synchronize({ quiet: true });
      }
    })().catch((initError) => setError(initError.message));
    return () => { cancelled = true; };
  }, [isAuthenticated, offlineSession, refreshCounts, synchronize, user?.id]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); synchronize(); };
    const onOffline = () => setOnline(false);
    const onChanged = () => { refreshCounts(); if (navigator.onLine) synchronize({ quiet: true }); };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) synchronize({ quiet: true });
    };
    const onWorker = (event) => {
      if (event.data?.type === "BIOHUERTO_SYNC_REQUEST") synchronize({ quiet: true });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("biohuerto:outbox-changed", onChanged);
    window.addEventListener("biohuerto:server-write", onChanged);
    document.addEventListener("visibilitychange", onVisibility);
    navigator.serviceWorker?.addEventListener("message", onWorker);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("biohuerto:outbox-changed", onChanged);
      window.removeEventListener("biohuerto:server-write", onChanged);
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.serviceWorker?.removeEventListener("message", onWorker);
    };
  }, [refreshCounts, synchronize]);

  const value = useMemo(() => ({
    online, syncing, pending, conflicts, persistent, estimate, lastSync, error, synchronize,
  }), [conflicts, error, estimate, lastSync, online, pending, persistent, synchronize, syncing]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) throw new Error("useOffline debe usarse dentro de OfflineProvider");
  return context;
}
