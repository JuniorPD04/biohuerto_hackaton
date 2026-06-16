import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Card,
  Button,
  Field,
  Input,
  Select,
  SearchInput,
  Modal,
  EmptyState,
  PageHeader,
  Photo,
  EstadoCosechaBadge,
  Icon,
  IconBtn,
} from "../components/ui/primitives.jsx";
import { tintFor, fmtFecha, fmtMoneda, ESTADO_COSECHA } from "../lib/theme.js";
import { useToast } from "../components/ui/Toast.jsx";
import { useConfirm, eliminarDialog, reactivarDialog } from "../components/ui/Confirm.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { cosechasApi, cultivosApi, usuariosApi, catalogosApi } from "../lib/resources.js";

const COSECHA_COLS = "2fr 1.4fr 1fr .9fr 1fr auto";
const COSECHA_HEAD = ["Producto", "Productor", "Cosecha", "Precio", "Estado", "Acciones"];

// Nombre visible de un cultivo (producto disponible).
const prodLabel = (c) => [c.especie, c.variedad].filter(Boolean).join(" ");

// Link de WhatsApp a partir del teléfono del productor (solo dígitos).
const waUrl = (telefono) => {
  const digits = (telefono || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
};

function useCosechas(toast) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await cosechasApi.list();
      setRows(Array.isArray(data) ? data : data?.items || []);
    } catch {
      toast("No se pudieron cargar las cosechas", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return { rows, loading, refresh };
}

export default function Ofertas() {
  const { tab } = useParams();
  return tab === "publicaciones" ? <PublicacionesView /> : <CosechasView />;
}

/* ============ Gestión de Cosechas ============ */
function CosechasView() {
  const toast = useToast();
  const confirm = useConfirm();
  const { rows, loading, refresh } = useCosechas(toast);
  const [formModal, setFormModal] = useState(null); // { mode, row }
  const [detalle, setDetalle] = useState(null); // cosecha a mostrar en detalle
  const [q, setQ] = useState("");
  const [precioF, setPrecioF] = useState("");
  const [view, setView] = useState(() => localStorage.getItem("bh-cosechaview") || "cards");

  useEffect(() => {
    localStorage.setItem("bh-cosechaview", view);
  }, [view]);

  const matchPrecio = (p) =>
    !precioF ||
    (precioF === "lt5" ? p < 5 : precioF === "5-10" ? p >= 5 && p <= 10 : p > 10);
  const cosechaActiva = (c) => c.estado !== "agotado" && c.estado !== "baja";
  const filtered = rows
    .filter(
      (c) =>
        (!q || (c.nombre_producto || "").toLowerCase().includes(q.toLowerCase())) &&
        matchPrecio(Number(c.precio_referencial) || 0)
    )
    // Cosechas activas (disponible/publicado) primero, conservando el orden original.
    .sort((a, b) => Number(cosechaActiva(b)) - Number(cosechaActiva(a)));

  const publicar = async (c) => {
    try {
      await cosechasApi.update(c.id, { estado: "publicado" });
      toast("Cosecha publicada");
      refresh();
    } catch {
      toast("No se pudo publicar", "danger");
    }
  };
  const marcarAgotado = async (c) => {
    const ok = await confirm({
      tone: "warning",
      question: `¿Marcar “${c.nombre_producto}” como agotado?`,
      message:
        "El producto se mostrará como agotado y dejará de ofrecerse en el mercado. Podrás reactivarlo cuando vuelvas a tener stock.",
      confirmLabel: "Sí, marcar agotado",
    });
    if (!ok) return;
    try {
      await cosechasApi.update(c.id, { estado: "agotado" });
      toast("Cosecha marcada como agotada");
      refresh();
    } catch {
      toast("No se pudo actualizar", "danger");
    }
  };
  const reactivar = async (c) => {
    const ok = await confirm(reactivarDialog(c.nombre_producto));
    if (!ok) return;
    try {
      await cosechasApi.update(c.id, { estado: "disponible" });
      toast("Cosecha reactivada");
      refresh();
    } catch {
      toast("No se pudo reactivar", "danger");
    }
  };

  const eliminar = async (c) => {
    const ok = await confirm(eliminarDialog(c.nombre_producto));
    if (!ok) return;
    try {
      await cosechasApi.remove(c.id);
      toast("Cosecha eliminada");
      refresh();
    } catch {
      toast("No se pudo eliminar", "danger");
    }
  };

  return (
    <div className="animate-fade">
      <PageHeader
        title="Gestión de Cosechas Disponibles"
        subtitle="Controla tus productos listos para la venta o intercambio."
        action={
          <Button icon="plus" onClick={() => setFormModal({ mode: "new" })}>
            Registrar
          </Button>
        }
      />

      <Card
        pad="p-5"
        className="mb-[26px] !border !border-line"
        style={{ background: "var(--chip-2)" }}
      >
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_260px_auto]">
          <Field label="Búsqueda">
            <SearchInput
              placeholder="Buscar producto…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </Field>
          <Field label="Filtrar por precio">
            <Select value={precioF} onChange={(e) => setPrecioF(e.target.value)}>
              <option value="">Todos los precios</option>
              <option value="lt5">Hasta S/ 5.00</option>
              <option value="5-10">S/ 5.00 – 10.00</option>
              <option value="gt10">Más de S/ 10.00</option>
            </Select>
          </Field>
          <div className="inline-flex gap-1 rounded-xl bg-chip p-[5px]">
            {[
              { id: "cards", icon: "grid", title: "Vista tarjetas" },
              { id: "list", icon: "list", title: "Vista lista" },
            ].map((v) => (
              <button
                key={v.id}
                title={v.title}
                onClick={() => setView(v.id)}
                className={`grid h-9 w-10 place-items-center rounded-[9px] transition-all ${
                  view === v.id
                    ? "bg-white text-primary shadow-[0_1px_3px_rgba(20,40,30,.12)]"
                    : "bg-transparent text-muted-2"
                }`}
              >
                <Icon name={v.icon} size={18} />
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <EmptyState icon="basket" title="Cargando cosechas…" desc="Un momento por favor." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="basket"
          title="Sin cosechas para estos filtros"
          desc="Ajusta la búsqueda o el filtro de precio para ver resultados."
        />
      ) : view === "list" ? (
        <Card pad="" className="overflow-hidden">
          <div
            className="grid gap-4 border-b border-line bg-chip px-[26px] py-4"
            style={{ gridTemplateColumns: COSECHA_COLS }}
          >
            {COSECHA_HEAD.map((h, i) => (
              <div
                key={h}
                className={`text-[12px] font-extrabold uppercase tracking-[.07em] text-muted-2 ${
                  i === COSECHA_HEAD.length - 1 ? "text-right" : "text-left"
                }`}
              >
                {h}
              </div>
            ))}
          </div>

          {filtered.map((c) => {
            const pub = c.estado === "publicado";
            const down = c.estado === "baja" || c.estado === "agotado";
            return (
              <div key={c.id} className="border-b border-line last:border-b-0" style={{ opacity: down ? 0.6 : 1 }}>
                <div
                  className="grid items-center gap-4 px-[26px] py-[18px]"
                  style={{ gridTemplateColumns: COSECHA_COLS }}
                >
                  <div className="flex min-w-0 items-center gap-[13px]">
                    <div className="flex min-w-0 flex-col gap-[2px]">
                      <div className="truncate text-[15.5px] font-extrabold text-text">
                        {c.nombre_producto}
                      </div>
                      <div className="truncate text-[12.5px] font-semibold text-muted-2">
                        Stock: {c.cantidad} {c.unidad}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-muted-1">
                      {c.productor || "Productor"}
                    </div>
                    <div className="truncate text-[12.5px] text-muted-2" style={{ fontFamily: "var(--mono)" }}>
                      {c.productor_telefono || "Sin teléfono"}
                    </div>
                  </div>

                  <div>
                    <span className="whitespace-nowrap font-mono text-[13px] text-muted-1">
                      {pub ? "Publicado" : fmtFecha(c.fecha_cosecha)}
                    </span>
                  </div>

                  <div
                    className="text-[16px] font-extrabold"
                    style={{ color: "var(--terracotta)" }}
                  >
                    {fmtMoneda(c.precio_referencial)}
                  </div>

                  <div>
                    <EstadoCosechaBadge estado={c.estado} />
                  </div>

                  <div className="ml-auto flex items-center gap-[2px]">
                    <IconBtn
                      name="eye"
                      title="Ver detalle"
                      onClick={() => setDetalle(c)}
                    />
                    <IconBtn
                      name="edit"
                      title="Modificar"
                      onClick={() => setFormModal({ mode: "edit", row: c })}
                    />
                    {down ? (
                      <IconBtn name="refresh" title="Reactivar" onClick={() => reactivar(c)} />
                    ) : (
                      <>
                        {!pub && (
                          <IconBtn name="megaphone" title="Publicar" onClick={() => publicar(c)} />
                        )}
                        <IconBtn name="ban" title="Marcar agotado" onClick={() => marcarAgotado(c)} />
                      </>
                    )}
                    <IconBtn name="trash" title="Eliminar" tone="danger" onClick={() => eliminar(c)} />
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      ) : (
        <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
          {filtered.map((c) => {
            const pub = c.estado === "publicado";
            const down = c.estado === "baja" || c.estado === "agotado";
            const agot = c.estado === "agotado";
            const tint = tintFor(c.nombre_producto || "");
            return (
              <Card
                key={c.id}
                pad="p-0"
                className="overflow-hidden"
                style={{ opacity: down ? 0.6 : 1 }}
              >
                <div className="relative h-[170px]">
                  <Photo
                    src={c.cultivo_imagen}
                    tint={down ? "default" : tint}
                    height={170}
                    label={`foto: ${(c.nombre_producto || "").toLowerCase()}`}
                  />
                  <span
                    className="absolute right-[14px] top-[14px] inline-flex items-center gap-[6px] rounded-[9px] px-3 py-[6px] text-[13px] font-bold text-white"
                    style={{
                      background: pub ? "var(--accent-700)" : "rgba(60,46,38,.78)",
                    }}
                  >
                    <Icon name={pub ? "checkCircle" : "calendar"} size={15} />
                    {pub ? "Publicado" : `Cosechado: ${fmtFecha(c.fecha_cosecha).slice(0, 5)}`}
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                      <h3 className="m-0 text-[19px] font-extrabold text-text">
                        {c.nombre_producto}
                      </h3>
                      <div className="flex items-center gap-[6px] text-[13.5px] font-semibold text-muted-2">
                        <Icon name="box" size={15} />
                        Stock: {c.cantidad} {c.unidad}
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div
                        className="text-[21px] font-extrabold"
                        style={{ color: "var(--terracotta)" }}
                      >
                        {fmtMoneda(c.precio_referencial)}
                      </div>
                      <div className="text-[12.5px] font-semibold text-muted-2">
                        {c.unidad}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="eye"
                    full
                    className="mt-4"
                    onClick={() => setDetalle(c)}
                  >
                    Ver detalle
                  </Button>
                  <div className="mt-[9px] grid grid-cols-2 gap-[9px]">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="edit"
                      onClick={() => setFormModal({ mode: "edit", row: c })}
                    >
                      Modificar
                    </Button>
                    {down ? (
                      <Button
                        variant="success"
                        size="sm"
                        icon="refresh"
                        onClick={() => reactivar(c)}
                      >
                        Reactivar
                      </Button>
                    ) : pub ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="ban"
                        onClick={() => marcarAgotado(c)}
                      >
                        Agotado
                      </Button>
                    ) : (
                      <Button
                        variant="success"
                        size="sm"
                        icon="megaphone"
                        onClick={() => publicar(c)}
                      >
                        Publicar
                      </Button>
                    )}
                    {!down && !pub && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="ban"
                        onClick={() => marcarAgotado(c)}
                      >
                        Agotado
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      icon="trash"
                      onClick={() => eliminar(c)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CosechaModal
        open={!!formModal}
        mode={formModal?.mode}
        cosecha={formModal?.row}
        onClose={() => setFormModal(null)}
        onSaved={() => {
          setFormModal(null);
          refresh();
        }}
        toast={toast}
      />

      <CosechaDetalleModal cosecha={detalle} onClose={() => setDetalle(null)} />
    </div>
  );
}

/* ============ Detalle de cosecha (solo lectura) ============ */
function CosechaDetalleModal({ cosecha, onClose }) {
  if (!cosecha) return null;
  const c = cosecha;
  const down = c.estado === "baja" || c.estado === "agotado";
  const wa = waUrl(c.productor_telefono);
  const dato = (label, value) => (
    <div className="flex flex-col gap-[3px]">
      <span className="text-[12px] font-extrabold uppercase tracking-[.06em] text-muted-2">
        {label}
      </span>
      <span className="text-[15px] font-semibold text-text">{value || "—"}</span>
    </div>
  );

  return (
    <Modal
      open={!!cosecha}
      onClose={onClose}
      title={c.nombre_producto}
      subtitle="Detalle de la cosecha"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="grid gap-[18px]">
        <div className="relative overflow-hidden rounded-2xl" style={{ opacity: down ? 0.7 : 1 }}>
          <Photo
            src={c.cultivo_imagen}
            tint={down ? "default" : tintFor(c.nombre_producto || "")}
            height={190}
            label={`foto: ${(c.nombre_producto || "").toLowerCase()}`}
          />
          <span className="absolute right-[14px] top-[14px]">
            <EstadoCosechaBadge estado={c.estado} />
          </span>
        </div>

        <div className="grid grid-cols-2 gap-[18px]">
          {dato("Precio referencial", fmtMoneda(c.precio_referencial))}
          {dato("Stock disponible", `${c.cantidad} ${c.unidad}`)}
          {dato("Cultivo de origen", c.cultivo)}
          {dato("Fecha de cosecha", fmtFecha(c.fecha_cosecha))}
          {dato("Productor", c.productor)}
          {dato("Teléfono", c.productor_telefono)}
        </div>

        {wa && (
          <Button
            variant="success"
            size="sm"
            icon="chat"
            full
            onClick={() => window.open(wa, "_blank", "noopener,noreferrer")}
          >
            Contactar productor por WhatsApp
          </Button>
        )}
      </div>
    </Modal>
  );
}

function CosechaModal({ open, onClose, onSaved, mode, cosecha, toast }) {
  const { user } = useAuth();
  const isAdmin = user?.rol === "admin";
  const [form, setForm] = useState({});
  const [cultivos, setCultivos] = useState([]);
  const [productores, setProductores] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [nuevaUnidad, setNuevaUnidad] = useState(false);
  const [nuevaUnidadNombre, setNuevaUnidadNombre] = useState("");
  const [creandoUnidad, setCreandoUnidad] = useState(false);
  const [saving, setSaving] = useState(false);
  const isNew = mode === "new";

  useEffect(() => {
    setForm({
      nombre_producto: cosecha?.nombre_producto || "",
      cultivo_id: cosecha?.cultivo_id || "",
      usuario_id: cosecha?.usuario_id || "",
      cantidad: cosecha?.cantidad ?? "",
      unidad_id: cosecha?.unidad_id ?? "",
      precio_referencial: cosecha?.precio_referencial ?? "",
      fecha_cosecha: (cosecha?.fecha_cosecha || "").split("T")[0] || "",
      estado: cosecha?.estado || "disponible",
    });
    setNuevaUnidad(false);
    setNuevaUnidadNombre("");
  }, [open, cosecha]);

  // Catálogo de unidades de medida (selector + "agregar nueva").
  useEffect(() => {
    if (!open) return;
    catalogosApi
      .list("unidades")
      .then((data) => setUnidades(Array.isArray(data) ? data : data?.items || []))
      .catch(() => setUnidades([]));
  }, [open]);

  // Si no hay unidad seleccionada, preseleccionar la primera del catálogo.
  useEffect(() => {
    if (form.unidad_id || unidades.length === 0) return;
    setForm((f) => ({ ...f, unidad_id: unidades[0].id }));
  }, [unidades, form.unidad_id]);

  // Al registrar, lista los cultivos en etapa de cosecha (listos para publicar) en orden alfabético.
  useEffect(() => {
    if (!open || !isNew) return;
    cultivosApi
      .list({ etapa: "cosecha" })
      .then((data) => {
        const arr = (Array.isArray(data) ? data : data?.items || []).filter(
          (c) => c.is_active !== false
        );
        arr.sort((a, b) =>
          prodLabel(a).localeCompare(prodLabel(b), "es", { sensitivity: "base" })
        );
        setCultivos(arr);
      })
      .catch(() => setCultivos([]));
  }, [open, isNew]);

  // Si es admin, lista los productores activos para elegir quién cosechó.
  useEffect(() => {
    if (!open || !isNew || !isAdmin) return;
    usuariosApi
      .list({ rol: "productor", is_active: true })
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.items || [];
        arr.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
        setProductores(arr);
      })
      .catch(() => setProductores([]));
  }, [open, isNew, isAdmin]);

  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const crearUnidad = async () => {
    const nombre = nuevaUnidadNombre.trim();
    if (!nombre) return;
    setCreandoUnidad(true);
    try {
      const creada = await catalogosApi.create("unidades", { nombre });
      const data = await catalogosApi.list("unidades");
      const items = Array.isArray(data) ? data : data?.items || [];
      setUnidades(items);
      const nuevoId = creada?.id ?? items.find((u) => u.nombre === nombre)?.id ?? "";
      if (nuevoId) setForm((f) => ({ ...f, unidad_id: nuevoId }));
      setNuevaUnidad(false);
      setNuevaUnidadNombre("");
    } catch {
      toast("No se pudo crear la unidad", "danger");
    } finally {
      setCreandoUnidad(false);
    }
  };

  const save = async () => {
    setSaving(true);
    const body = {
      nombre_producto: form.nombre_producto || "Nuevo producto",
      cantidad: Number(form.cantidad) || 0,
      unidad_id: form.unidad_id === "" ? null : Number(form.unidad_id),
      precio_referencial: Number(form.precio_referencial) || 0,
      fecha_cosecha:
        form.fecha_cosecha || (isNew ? new Date().toISOString().split("T")[0] : null),
    };
    if (isNew && form.cultivo_id) body.cultivo_id = form.cultivo_id;
    if (isNew && isAdmin && form.usuario_id) body.usuario_id = Number(form.usuario_id);
    try {
      if (isNew) {
        await cosechasApi.create({ ...body, estado: "disponible" });
        toast("Cosecha registrada");
      } else {
        await cosechasApi.update(cosecha.id, body);
        toast("Cambios guardados");
      }
      onSaved();
    } catch {
      toast("No se pudo guardar la cosecha", "danger");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? "Registrar cosecha" : "Editar cosecha"}
      subtitle="Producto disponible para venta o intercambio"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="check" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : isNew ? "Registrar" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <div className="grid gap-[18px]">
        {isNew ? (
          <>
            <Field
              label="Producto"
              hint="Se listan los cultivos en etapa de cosecha."
            >
              <Select
                value={form.cultivo_id || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const c = cultivos.find((x) => String(x.id) === String(id));
                  setForm((f) => ({
                    ...f,
                    cultivo_id: id,
                    nombre_producto: c ? prodLabel(c) : "",
                    fecha_cosecha: c?.fecha_estimada_cosecha
                      ? c.fecha_estimada_cosecha.split("T")[0]
                      : "",
                  }));
                }}
              >
                <option value="">Selecciona un producto…</option>
                {cultivos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {prodLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
            {isAdmin && (
              <Field
                label="Productor"
                hint="Elige qué productor cosechó este producto."
              >
                <Select value={form.usuario_id || ""} onChange={set("usuario_id")}>
                  <option value="">Selecciona un productor…</option>
                  {productores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        ) : (
          <Field label="Nombre del producto">
            <Input value={form.nombre_producto} onChange={set("nombre_producto")} />
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Cantidad / Stock">
            <Input
              type="number"
              value={form.cantidad}
              onChange={set("cantidad")}
              placeholder="Ej: 15.5"
            />
          </Field>
          <Field label="Unidad">
            {nuevaUnidad ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nuevaUnidadNombre}
                  onChange={(e) => setNuevaUnidadNombre(e.target.value)}
                  placeholder="Ej: por kg"
                />
                <Button
                  variant="success"
                  size="sm"
                  icon="check"
                  onClick={crearUnidad}
                  disabled={creandoUnidad}
                >
                  {creandoUnidad ? "…" : "Crear"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNuevaUnidad(false);
                    setNuevaUnidadNombre("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={form.unidad_id || ""} onChange={set("unidad_id")}>
                    <option value="">Selecciona una unidad…</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="plus"
                  onClick={() => setNuevaUnidad(true)}
                >
                  Nueva
                </Button>
              </div>
            )}
          </Field>
          <Field label="Precio referencial (S/)">
            <Input
              type="number"
              value={form.precio_referencial}
              onChange={set("precio_referencial")}
              placeholder="0.00"
            />
          </Field>
          {!isNew && (
            <Field label="Fecha de cosecha">
              <Input
                type="date"
                value={form.fecha_cosecha}
                onChange={set("fecha_cosecha")}
              />
            </Field>
          )}
        </div>
        {!isNew && (
          <Field
            label="Estado / disponibilidad"
            hint="Se modifica con las acciones “Publicar” / “Agotado”."
          >
            <Input
              readOnly
              disabled
              value={(ESTADO_COSECHA[form.estado] || ESTADO_COSECHA.disponible).label}
              className="!cursor-not-allowed !bg-chip !text-muted-2 opacity-85"
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ============ Publicaciones ============ */
function PublicacionesView() {
  const toast = useToast();
  const { rows, loading } = useCosechas(toast);
  const pubs = rows.filter((c) => c.estado === "publicado");

  return (
    <div className="animate-fade">
      <PageHeader
        title="Publicaciones de cosechas"
        subtitle="Vista pública de los productos que ofreces al mercado local."
        action={
          <Button variant="secondary" icon="eye">
            Vista previa pública
          </Button>
        }
      />
      {loading ? (
        <EmptyState icon="megaphone" title="Cargando publicaciones…" desc="Un momento por favor." />
      ) : pubs.length === 0 ? (
        <EmptyState
          icon="megaphone"
          title="Aún no tienes publicaciones activas"
          desc="Publica una cosecha desde Gestión de Cosechas para que aparezca aquí."
        />
      ) : (
        <div className="grid gap-[22px] [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {pubs.map((c) => (
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
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="m-0 text-[19px] font-extrabold text-text">
                    {c.nombre_producto}
                  </h3>
                  <span
                    className="text-[19px] font-extrabold"
                    style={{ color: "var(--terracotta)" }}
                  >
                    {fmtMoneda(c.precio_referencial)}
                  </span>
                </div>
                <div className="mt-1 text-[13.5px] text-muted-2">
                  Disponible: {c.cantidad} · {c.unidad}
                </div>
                <div className="mt-[6px] flex items-center gap-[6px] text-[13px] text-muted-2">
                  <Icon name="users" size={14} />
                  {c.productor || "Productor"}
                </div>
                <Button
                  variant="success"
                  size="sm"
                  icon="chat"
                  full
                  className="mt-4"
                  onClick={() => {
                    const url = waUrl(c.productor_telefono);
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                    else toast("Este productor no tiene teléfono registrado", "danger");
                  }}
                >
                  Contactar productor
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
