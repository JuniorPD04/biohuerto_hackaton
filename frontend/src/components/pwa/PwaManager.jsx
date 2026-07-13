import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { useToast } from "../ui/Toast.jsx";

export default function PwaManager() {
  const toast = useToast();
  const [update, setUpdate] = useState(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  useEffect(() => {
    const updateSW = registerSW({
      onOfflineReady: () => toast("Biohuerto ya puede usarse sin conexion"),
      onNeedRefresh: () => setNeedsRefresh(true),
      onRegisterError: () => toast("No se pudo preparar el modo offline", "danger"),
    });
    setUpdate(() => updateSW);
  }, [toast]);

  if (!update || !needsRefresh) return null;
  return (
    <button
      className="fixed bottom-20 right-4 z-50 rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-white shadow-toast md:bottom-5"
      onClick={() => update(true)}
    >
      Actualizar aplicacion
    </button>
  );
}
