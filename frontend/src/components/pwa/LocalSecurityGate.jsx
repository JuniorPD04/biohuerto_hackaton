import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.jsx";
import { getLocalSecurity, verifyBiometric, verifyLocalPin } from "../../lib/localSecurity.js";
import logo from "../../assets/logo_biohuerto.jpeg";

export default function LocalSecurityGate({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [hiddenAt, setHiddenAt] = useState(null);
  const config = user?.id ? getLocalSecurity(user.id) : { mode: "none" };

  useEffect(() => {
    setLocked(Boolean(isAuthenticated && user?.id && getLocalSecurity(user.id).mode !== "none"));
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setHiddenAt(Date.now());
      else if (hiddenAt && Date.now() - hiddenAt > 15 * 60 * 1000 && config.mode !== "none") setLocked(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [config.mode, hiddenAt]);

  const unlockPin = async (event) => {
    event.preventDefault();
    if (await verifyLocalPin(user.id, pin)) { setLocked(false); setPin(""); setError(""); }
    else setError("PIN incorrecto");
  };

  const unlockBiometric = async () => {
    try { if (await verifyBiometric(user.id)) setLocked(false); }
    catch { setError("No se pudo validar la identidad en este dispositivo."); }
  };

  if (!locked) return children;
  return (
    <div className="fixed inset-0 z-[200] grid min-h-[100dvh] place-items-center bg-bg p-5">
      <div className="w-full max-w-sm rounded-[20px] bg-white p-6 text-center shadow-modal">
        <img src={logo} alt="Biohuerto" className="mx-auto h-20 w-20 rounded-2xl object-cover" />
        <h1 className="mt-5 text-xl font-extrabold text-text">Desbloquear Biohuerto</h1>
        <p className="mt-2 text-sm text-muted-2">Proteccion local de {user?.nombre}.</p>
        {config.mode === "pin" ? (
          <form className="mt-5" onSubmit={unlockPin}>
            <label className="block text-left text-sm font-extrabold text-text">PIN</label>
            <input autoFocus inputMode="numeric" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="mt-2 h-12 w-full rounded-xl border border-line-2 px-4 text-center text-xl tracking-[.35em] outline-none focus:border-primary" />
            <button className="mt-4 min-h-11 w-full rounded-xl bg-primary font-extrabold text-white">Desbloquear</button>
          </form>
        ) : (
          <button className="mt-5 min-h-11 w-full rounded-xl bg-primary font-extrabold text-white" onClick={unlockBiometric}>Usar biometria</button>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-[#b23a2e]">{error}</p>}
      </div>
    </div>
  );
}
