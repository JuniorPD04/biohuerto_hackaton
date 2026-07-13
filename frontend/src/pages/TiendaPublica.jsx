import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  Photo,
  SearchInput,
  Select,
} from "../components/ui/primitives.jsx";
import { cosechasApi } from "../lib/resources.js";
import { fmtMoneda, tintFor } from "../lib/theme.js";
import logo from "../assets/logo_biohuerto.jpeg";

const waUrl = (telefono) => {
  const digits = (telefono || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
};

export default function TiendaPublica() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [precioF, setPrecioF] = useState("");

  useEffect(() => {
    let cancel = false;
    cosechasApi
      .public()
      .then((data) => {
        if (!cancel) setRows(Array.isArray(data) ? data : data?.items || []);
      })
      .catch(() => !cancel && setError(true))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matchPrecio = (p) =>
      !precioF || (precioF === "lt5" ? p < 5 : precioF === "5-10" ? p >= 5 && p <= 10 : p > 10);
    return rows.filter((c) => {
      const hay = `${c.nombre_producto || ""} ${c.cultivo || ""} ${c.productor || ""}`.toLowerCase();
      return (!term || hay.includes(term)) && matchPrecio(Number(c.precio_referencial) || 0);
    });
  }, [precioF, q, rows]);

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/proyecto" className="flex items-center gap-3">
            <img src={logo} alt="Biohuertos Urbanos CISUSAT" className="h-10 w-10 rounded-xl object-cover" />
            <div className="hidden sm:block">
              <div className="text-[15px] font-extrabold leading-none text-text">Minimarket Ecológico</div>
              <div className="mt-1 text-[12.5px] font-semibold text-muted-2">Biohuertos Urbanos CISUSAT</div>
            </div>
          </Link>
          <div className="flex-1" />
          <Link to="/proyecto" className="text-sm font-bold text-muted-1 hover:text-primary">
            Sobre el proyecto
          </Link>
          <Link
            to="/login"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:brightness-95"
          >
            Soy productor
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 pb-16 pt-7 sm:px-6">
        <div className="mb-6">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-.02em] text-primary sm:text-[32px]">
            Productos de nuestros biohuertos urbanos
          </h1>
          <p className="mt-2 max-w-[62ch] text-[15px] text-muted-2">
            Catálogo del Minimarket Ecológico CISUSAT: hortalizas y productos agroecológicos cultivados por
            productores de la comunidad. Contacta directamente al productor por WhatsApp — no necesitas crear
            una cuenta para mirar.
          </p>
        </div>

        <Card
          pad="p-5"
          className="mb-[26px] !border !border-line"
          style={{ background: "var(--chip-2)" }}
        >
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_260px]">
            <Field label="Búsqueda">
              <SearchInput
                placeholder="Buscar producto o productor…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </Field>
            <Field label="Precio">
              <Select value={precioF} onChange={(e) => setPrecioF(e.target.value)}>
                <option value="">Todos los precios</option>
                <option value="lt5">Hasta S/ 5.00</option>
                <option value="5-10">S/ 5.00 – 10.00</option>
                <option value="gt10">Más de S/ 10.00</option>
              </Select>
            </Field>
          </div>
        </Card>

        {loading ? (
          <EmptyState icon="store" title="Cargando productos…" desc="Un momento por favor." />
        ) : error ? (
          <EmptyState
            icon="store"
            title="No se pudo cargar el catálogo"
            desc="Intenta recargar la página en unos minutos."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="store"
            title="Sin productos disponibles"
            desc="Prueba con otra búsqueda o vuelve cuando haya nuevas publicaciones."
          />
        ) : (
          <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {filtered.map((c) => {
              const url = waUrl(c.productor_telefono || c.telefono);
              return (
                <Card key={c.id} pad="p-0" hover className="overflow-hidden">
                  <Photo
                    src={c.cultivo_imagen}
                    tint={tintFor(c.nombre_producto || "")}
                    height={170}
                    label={(c.nombre_producto || "").toLowerCase()}
                    badge={
                      <span className="absolute left-[14px] top-[14px] inline-flex items-center gap-[5px] rounded-lg bg-accent-700 px-[11px] py-[5px] text-[12.5px] font-bold text-white">
                        <Icon name="checkCircle" size={14} />
                        En venta
                      </span>
                    }
                  />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="m-0 text-[18px] font-extrabold text-text">{c.nombre_producto}</h3>
                        <div className="mt-1 text-[13px] text-muted-2">
                          Disponible: {c.cantidad} {c.unidad || "und"}
                        </div>
                      </div>
                      <span className="text-right text-[19px] font-extrabold text-terracotta">
                        {fmtMoneda(c.precio_referencial)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-[6px] text-[13px] text-muted-2">
                      <span className="inline-flex items-center gap-[7px]">
                        <Icon name="users" size={14} />
                        {c.productor || "Productor"}
                      </span>
                      <span className="inline-flex items-center gap-[7px]">
                        <Icon name="leaf" size={14} />
                        {c.cultivo || "Producto de biohuerto"}
                      </span>
                    </div>
                    <Button
                      variant="success"
                      size="sm"
                      icon="chat"
                      full
                      className="mt-4"
                      disabled={!url}
                      onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
                    >
                      {url ? "Contactar por WhatsApp" : "Sin teléfono registrado"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-line py-8 text-center text-[13px] text-muted-2">
        Programa Institucional CISUSAT · Dirección de Responsabilidad Social Universitaria — USAT
      </footer>
    </div>
  );
}
