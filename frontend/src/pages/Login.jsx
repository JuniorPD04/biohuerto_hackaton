import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, LockKeyhole, Mail, Sprout } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../context/AuthContext.jsx";

const schema = z.object({
  email: z.string().email("Correo invalido"),
  password: z.string().min(1, "Ingresa tu contrasena"),
});

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: "productor.demo@biohuerto.pe", password: "Demo123!" },
  });

  async function onSubmit(values) {
    setApiError("");
    try {
      await login(values);
      navigate("/", { replace: true });
    } catch (err) {
      setApiError(err.response?.data?.detail || "No se pudo iniciar sesion.");
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 bg-slate-50 lg:grid-cols-[1fr_1.15fr]">
      <section className="flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-leaf-800 text-white">
              <Sprout size={24} />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-950">Biohuerto Inteligente</p>
              <p className="text-sm text-slate-500">USAT Hackathon 2026</p>
            </div>
          </div>

          <form className="panel p-5" onSubmit={handleSubmit(onSubmit)}>
            <h1 className="text-xl font-bold text-slate-950">Ingresar</h1>
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="form-label">Correo</span>
                <span className="relative mt-1 block">
                  <Mail className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
                  <input className="form-input pl-10" autoComplete="email" {...register("email")} />
                </span>
                {errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email.message}</span>}
              </label>

              <label className="block">
                <span className="form-label">Contrasena</span>
                <span className="relative mt-1 block">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
                  <input
                    className="form-input pl-10 pr-10"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    {...register("password")}
                  />
                  <button
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    title="Mostrar contrasena"
                  >
                    <Eye size={17} />
                  </button>
                </span>
                {errors.password && <span className="mt-1 block text-xs text-red-600">{errors.password.message}</span>}
              </label>
            </div>

            {apiError && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{apiError}</p>}

            <button
              className="mt-5 h-11 w-full rounded-md bg-leaf-800 px-4 text-sm font-bold text-white transition hover:bg-leaf-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Ingresando..." : "Ingresar"}
            </button>
            <p className="mt-4 text-center text-sm text-slate-500">
              <Link className="font-semibold text-leaf-800 hover:text-leaf-900" to="/registro">
                Crear cuenta
              </Link>
            </p>
          </form>
        </div>
      </section>

      <section className="hidden min-h-screen bg-[url('https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1400&q=80')] bg-cover bg-center lg:block">
        <div className="flex h-full items-end bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent p-10">
          <div className="max-w-xl text-white">
            <p className="text-sm font-semibold uppercase tracking-wide text-leaf-100">Biohuertos urbanos</p>
            <p className="mt-2 text-4xl font-bold">Gestion productiva, trazabilidad y reporte en una sola demo estable.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

