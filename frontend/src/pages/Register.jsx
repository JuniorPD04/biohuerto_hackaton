import { zodResolver } from "@hookform/resolvers/zod";
import { Sprout } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../context/AuthContext.jsx";

const schema = z.object({
  nombre: z.string().min(2, "Ingresa tu nombre").max(160),
  email: z.string().email("Correo invalido"),
  password: z.string().min(8, "Minimo 8 caracteres"),
  rol: z.enum(["productor", "consumidor"]),
});

export default function Register() {
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { rol: "productor" },
  });

  async function onSubmit(values) {
    setApiError("");
    try {
      await createAccount(values);
      navigate("/", { replace: true });
    } catch (err) {
      setApiError(err.response?.data?.detail || "No se pudo crear la cuenta.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <form className="panel w-full max-w-md p-5" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-leaf-800 text-white">
            <Sprout size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Crear cuenta</h1>
            <p className="text-sm text-slate-500">Biohuerto Inteligente</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <Field label="Nombre" error={errors.nombre?.message}>
            <input className="form-input" {...register("nombre")} />
          </Field>
          <Field label="Correo" error={errors.email?.message}>
            <input className="form-input" autoComplete="email" {...register("email")} />
          </Field>
          <Field label="Contrasena" error={errors.password?.message}>
            <input className="form-input" type="password" autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Rol" error={errors.rol?.message}>
            <select className="form-input" {...register("rol")}>
              <option value="productor">Productor</option>
              <option value="consumidor">Consumidor</option>
            </select>
          </Field>
        </div>

        {apiError && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{apiError}</p>}

        <button
          className="mt-5 h-11 w-full rounded-md bg-leaf-800 px-4 text-sm font-bold text-white transition hover:bg-leaf-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Creando..." : "Crear cuenta"}
        </button>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link className="font-semibold text-leaf-800 hover:text-leaf-900" to="/login">
            Ya tengo cuenta
          </Link>
        </p>
      </form>
    </main>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <span className="mt-1 block">{children}</span>
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

