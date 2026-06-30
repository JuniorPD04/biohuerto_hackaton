import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Photo,
  SearchInput,
  Select,
} from "../components/ui/primitives.jsx";
import { cosechasApi } from "../lib/resources.js";
import { fmtMoneda, tintFor } from "../lib/theme.js";
import { useToast } from "../components/ui/Toast.jsx";
import { useOffline } from "../context/OfflineContext.jsx";

const waUrl = (telefono) => {
  const digits = (telefono || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
};

export default function Mercado() {
  const toast = useToast();
  const { online } = useOffline();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [precioF, setPrecioF] = useState("");

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    cosechasApi
      .public()
      .then((data) => {
        if (!cancel) setRows(Array.isArray(data) ? data : data?.items || []);
      })
      .catch(() => toast("No se pudieron cargar los productos", "danger"))
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [toast]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matchPrecio = (p) =>
      !precioF ||
      (precioF === "lt5" ? p < 5 : precioF === "5-10" ? p >= 5 && p <= 10 : p > 10);
    return rows.filter((c) => {
      const hay = `${c.nombre_producto || ""} ${c.cultivo || ""} ${c.productor || ""}`.toLowerCase();
      return (!term || hay.includes(term)) && matchPrecio(Number(c.precio_referencial) || 0);
    });
  }, [precioF, q, rows]);

  return (
    <div className="animate-fade">
      <PageHeader
        title="Mercado de productos"
        subtitle="Productos publicados por productores locales para compra directa."
      />

      {!online && (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-[#fff7e8] px-4 py-3 text-sm font-semibold text-[#80501e]">
          <Icon name="wifi" size={18} /> Mostrando el ultimo mercado guardado. Contactar requiere conexion.
        </div>
      )}

      <Card pad="p-5" className="mb-[26px] !border !border-line" style={{ background: "var(--chip-2)" }}>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_260px]">
          <Field label="Busqueda">
            <SearchInput placeholder="Buscar producto o productor..." value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <Field label="Precio">
            <Select value={precioF} onChange={(e) => setPrecioF(e.target.value)}>
              <option value="">Todos los precios</option>
              <option value="lt5">Hasta S/ 5.00</option>
              <option value="5-10">S/ 5.00 - 10.00</option>
              <option value="gt10">Mas de S/ 10.00</option>
            </Select>
          </Field>
        </div>
      </Card>

      {loading ? (
        <EmptyState icon="store" title="Cargando productos..." desc="Estamos consultando las publicaciones activas." />
      ) : filtered.length === 0 ? (
        <EmptyState icon="store" title="Sin productos disponibles" desc="Prueba con otra busqueda o vuelve cuando haya nuevas publicaciones." />
      ) : (
        <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {filtered.map((c) => {
            const url = waUrl(c.productor_telefono || c.telefono);
            return (
              <Card key={c.id} pad="p-0" hover className="overflow-hidden">
                <Photo
                  src={c.cultivo_imagen}
                  tint={tintFor(c.nombre_producto || "")}
                  height={180}
                  label={`foto: ${(c.nombre_producto || "").toLowerCase()}`}
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
                      <h3 className="m-0 text-[19px] font-extrabold text-text">{c.nombre_producto}</h3>
                      <div className="mt-1 text-[13.5px] text-muted-2">
                        Disponible: {c.cantidad} {c.unidad || "und"}
                      </div>
                    </div>
                    <span className="text-right text-[20px] font-extrabold text-terracotta">
                      {fmtMoneda(c.precio_referencial)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-[7px] text-[13.5px] text-muted-2">
                    <span className="inline-flex items-center gap-[7px]">
                      <Icon name="users" size={15} />
                      {c.productor || "Productor"}
                    </span>
                    <span className="inline-flex items-center gap-[7px]">
                      <Icon name="leaf" size={15} />
                      {c.cultivo || "Producto de biohuerto"}
                    </span>
                  </div>
                  <Button
                    variant="success"
                    size="sm"
                    icon="chat"
                    full
                    className="mt-4"
                    disabled={!url || !online}
                    onClick={() => {
                      if (!online) toast("Necesitas conexion para abrir WhatsApp", "danger");
                      else if (url) window.open(url, "_blank", "noopener,noreferrer");
                      else toast("Este productor no tiene telefono registrado", "danger");
                    }}
                  >
                    Contactar productor
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
