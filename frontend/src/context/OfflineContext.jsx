import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { clearOfflineRecords, countOfflineRecords, enqueueOfflineRecord, getOfflineRecords } from "../lib/offlineQueue.js";

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState("");

  const refreshCount = useCallback(async () => {
    if (!("indexedDB" in window)) return;
    setPendingCount(await countOfflineRecords());
  }, []);

  const enqueue = useCallback(
    async ({ tabla, uuid, payload, created_at_local }) => {
      const record = {
        id: `${tabla}:${uuid}`,
        tabla,
        uuid,
        payload,
        created_at_local,
      };
      await enqueueOfflineRecord(record);
      await refreshCount();
      setLastSyncMessage("Guardado localmente");
      return record;
    },
    [refreshCount]
  );

  const syncPending = useCallback(async () => {
    if (!navigator.onLine || syncing) return false;
    const records = await getOfflineRecords();
    if (records.length === 0) {
      await refreshCount();
      return true;
    }
    setSyncing(true);
    try {
      const { data } = await api.post("/api/sync", {
        registros: records.map(({ tabla, uuid, payload, created_at_local }) => ({
          tabla,
          uuid,
          payload,
          created_at_local,
        })),
      });
      const conflictIds = new Set((data.conflictos || []).map((item) => `${item.tabla}:${item.uuid}`));
      const syncedIds = records.filter((item) => !conflictIds.has(item.id)).map((item) => item.id);
      await clearOfflineRecords(syncedIds);
      await refreshCount();
      setLastSyncMessage(
        data.conflictos?.length ? `${data.sincronizados} sincronizados, ${data.conflictos.length} conflictos` : `${data.sincronizados} sincronizados`
      );
      return true;
    } catch {
      setLastSyncMessage("Sincronizacion pendiente");
      return false;
    } finally {
      setSyncing(false);
    }
  }, [refreshCount, syncing]);

  useEffect(() => {
    refreshCount();
    const online = () => {
      setIsOnline(true);
      syncPending();
    };
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [refreshCount, syncPending]);

  const value = useMemo(
    () => ({ isOnline, pendingCount, syncing, lastSyncMessage, enqueue, syncPending, refreshCount }),
    [enqueue, isOnline, lastSyncMessage, pendingCount, refreshCount, syncPending, syncing]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOffline debe usarse dentro de OfflineProvider");
  }
  return context;
}

