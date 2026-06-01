import { RefreshCw, Store } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import EmptyState from "../components/ui/EmptyState.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import { api } from "../lib/api.js";
import { dateText, money, number } from "../lib/format.js";

export default function Mercado() {
  const [cosechas, setCosechas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/api/cosechas/public");
      setCosechas(data);
    } catch (err) {
      setError(err.response?.data?.detail || "No se pudo cargar el mercado.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Mercado"
        eyebrow="Cosechas disponibles"
        actions={
          <button className="icon-button" onClick={load} title="Actualizar" type="button">
            <RefreshCw size={18} />
          </button>
        }
      />
      {loading && <p className="text-sm text-slate-500">Cargando cosechas...</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!loading && cosechas.length === 0 && <EmptyState title="Sin cosechas publicadas" detail="El catalogo publico aparecera aqui cuando existan ofertas disponibles." />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cosechas.map((item) => (
          <article className="panel overflow-hidden" key={item.id}>
            <div className="flex aspect-[4/3] items-center justify-center bg-leaf-50 text-leaf-800">
              {item.foto_url ? <img className="h-full w-full object-cover" src={item.foto_url} alt={item.nombre_producto} /> : <Store size={44} />}
            </div>
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-leaf-800">{item.biohuerto}</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">{item.nombre_producto}</h2>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  {number(item.cantidad)} {item.unidad}
                </p>
                <p className="text-base font-bold text-slate-950">{money(item.precio_referencial)}</p>
              </div>
              <p className="mt-2 text-sm text-slate-500">Cosecha: {dateText(item.fecha_cosecha)}</p>
              <p className="mt-3 rounded-md bg-slate-50 p-2 text-sm text-slate-600">{item.contacto_publico || "Contacto disponible con productor"}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

