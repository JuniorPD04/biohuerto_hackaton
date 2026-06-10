import { Eye, EyeOff, LockKeyhole, Mail, Sprout } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("rosa.campos@biohuerto.pe");
  const [password, setPassword] = useState("biohuerto2026");
  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setApiError("");
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate("/panel", { replace: true });
    } catch (err) {
      setApiError(err.response?.data?.detail || "No se pudo iniciar sesion.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-slate-50 lg:grid-cols-[1fr_1.15fr]">
      {/* Formulario */}
      <section className="flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#166534] text-white">
              <Sprout size={24} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-950">Biohuerto Inteligente</p>
              <p className="text-sm text-slate-500">USAT Hackathon 2026</p>
            </div>
          </div>

          <form
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,0.08)]"
            onSubmit={onSubmit}
          >
            <h1 className="text-xl font-bold text-slate-950">Ingresar</h1>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Correo</span>
                <span className="relative mt-1 block">
                  <Mail className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#166534] focus:ring-2 focus:ring-[#166534]/20"
                    autoComplete="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </span>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contrasena</span>
                <span className="relative mt-1 block">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-[#166534] focus:ring-2 focus:ring-[#166534]/20"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    title="Mostrar contrasena"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
            </div>

            {apiError && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{apiError}</p>}

            <button
              className="mt-5 h-11 w-full rounded-md bg-[#166534] px-4 text-sm font-bold text-white transition hover:bg-[#14532d] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Ingresando..." : "Ingresar"}
            </button>
            <p className="mt-4 text-center text-sm text-slate-500">
              <button type="button" className="font-semibold text-[#166534] hover:text-[#14532d]">
                Crear cuenta
              </button>
            </p>
          </form>
        </div>
      </section>

      {/* Imagen */}
      <section className="hidden min-h-screen bg-[url('https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1400&q=80')] bg-cover bg-center lg:block">
        <div className="flex h-full items-end bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent p-10">
          <div className="max-w-xl text-white">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#dcfce7]">Biohuertos urbanos</p>
            <p className="mt-2 text-4xl font-bold">
              Gestion productiva, trazabilidad y reporte en una sola demo estable.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
