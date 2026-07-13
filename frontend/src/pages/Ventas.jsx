import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  IconBtn,
  Input,
  Modal,
  PageHeader,
  Photo,
  Select,
} from "../components/ui/primitives.jsx";
import { fmtFecha, fmtMoneda, localDateStr, tintFor } from "../lib/theme.js";
import { useToast } from "../components/ui/Toast.jsx";
import { useConfirm } from "../components/ui/Confirm.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { cosechasApi, usuariosApi, ventasApi } from "../lib/resources.js";

const RONDA_ACTIVA_KEY = (userId) => `bh-ronda-activa:${userId}`;

const ESTADO_RONDA = {
  abierta: { bg: "#dcefd7", fg: "#2f6b34", dot: "#5aa860", label: "Abierta" },
  cerrada: { bg: "#e7e9e6", fg: "#5a625a", dot: "#9aa39a", label: "Cerrada" },
};

const horaLocalStr = (d = new Date()) => d.toTimeString().slice(0, 8);
const horaCorta = (hora) => (hora || "").slice(0, 5);
const cosechaVendible = (c) =>
  (c.estado === "disponible" || c.estado === "publicado") && Number(c.cantidad) > 0;

export default function Ventas() {
  const { tab } = useParams();
  return tab === "historial" ? <HistorialVentasView /> : <NuevaVentaView />;
}

/* ============ Venta ahora ============ */
function NuevaVentaView() {
  const { user } = useAuth();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const navigate = useNavigate();

  const [ronda, setRonda] = useState(null);
  const [loadingRonda, setLoadingRonda] = useState(true);
  const [showNombreModal, setShowNombreModal] = useState(false);
  const [nombreSugerido, setNombreSugerido] = useState("");
  const [nombreInput, setNombreInput] = useState("");
  const [creandoRonda, setCreandoRonda] = useState(false);

  const [rondasAbiertas, setRondasAbiertas] = useState([]);
  const [showSelectorModal, setShowSelectorModal] = useState(false);
  const [loadingSelector, setLoadingSelector] = useState(false);

  const [productos, setProductos] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [carrito, setCarrito] = useState(new Map());
  const [showCarritoModal, setShowCarritoModal] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const abrirModalNombre = () => {
    setNombreSugerido(`Minimarket venta ${fmtFecha(localDateStr())}`);
    setNombreInput("");
    setShowSelectorModal(false);
    setShowNombreModal(true);
  };

  const seleccionarRonda = (r) => {
    localStorage.setItem(RONDA_ACTIVA_KEY(user.id), r.id);
    setRonda(r);
    setCarrito(new Map());
    setShowSelectorModal(false);
    setShowNombreModal(false);
  };

  // Abre el selector de rondas abiertas (para retomar una o iniciar otra).
  const abrirSelectorRondas = async () => {
    setLoadingSelector(true);
    setShowSelectorModal(true);
    try {
      const data = await ventasApi.listarRondas({ estado: "abierta" });
      setRondasAbiertas(Array.isArray(data) ? data : data?.items || []);
    } catch {
      toast("No se pudieron cargar tus rondas abiertas", "danger");
    } finally {
      setLoadingSelector(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;
    (async () => {
      setLoadingRonda(true);
      const key = RONDA_ACTIVA_KEY(user.id);
      const storedId = localStorage.getItem(key);
      if (storedId) {
        try {
          const detalle = await ventasApi.detalleRonda(storedId);
          if (!cancel && detalle.estado === "abierta") {
            setRonda(detalle);
            setLoadingRonda(false);
            return;
          }
        } catch {
          // La ronda ya no existe o no es accesible: se limpia abajo.
        }
        localStorage.removeItem(key);
      }
      // No hay ronda guardada localmente (u otro dispositivo/sesión la cerró):
      // se consultan las rondas abiertas del productor antes de pedir un nombre.
      try {
        const data = await ventasApi.listarRondas({ estado: "abierta" });
        const abiertas = Array.isArray(data) ? data : data?.items || [];
        if (cancel) return;
        if (abiertas.length === 1) {
          seleccionarRonda(abiertas[0]);
        } else if (abiertas.length > 1) {
          setRondasAbiertas(abiertas);
          setShowSelectorModal(true);
        } else {
          abrirModalNombre();
        }
      } catch {
        if (!cancel) abrirModalNombre();
      } finally {
        if (!cancel) setLoadingRonda(false);
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const cargarProductos = async () => {
    setLoadingProductos(true);
    try {
      const data = await cosechasApi.list();
      const arr = Array.isArray(data) ? data : data?.items || [];
      setProductos(arr.filter(cosechaVendible));
    } catch {
      toast("No se pudieron cargar tus productos", "danger");
    } finally {
      setLoadingProductos(false);
    }
  };

  useEffect(() => {
    if (ronda?.id) cargarProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ronda?.id]);

  const iniciarRonda = async (nombre) => {
    setCreandoRonda(true);
    try {
      const creada = await ventasApi.crearRonda({
        nombre,
        fecha: localDateStr(),
        hora_inicio: horaLocalStr(),
      });
      localStorage.setItem(RONDA_ACTIVA_KEY(user.id), creada.id);
      setRonda(creada);
      setCarrito(new Map());
      setShowNombreModal(false);
      toast(
        creada.nombre !== nombre
          ? `Ya existía una ronda con ese nombre; se creó como "${creada.nombre}"`
          : "Ronda de venta iniciada"
      );
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo iniciar la ronda de venta", "danger");
    } finally {
      setCreandoRonda(false);
    }
  };

  // Solo abre el modal para nombrar la nueva ronda; la ronda actual se
  // mantiene visible e intacta hasta que se confirme la creación (si se
  // cancela el modal, no se pierde nada).
  const nuevaRonda = () => {
    abrirModalNombre();
  };

  const finalizarRonda = async () => {
    const ok = await confirmDialog({
      tone: "primary",
      question: `¿Finalizar la ronda "${ronda.nombre}"?`,
      message: "No podrás seguir registrando ventas en esta ronda. Quedará disponible para consulta en el Historial de ventas.",
      confirmLabel: "Sí, finalizar",
    });
    if (!ok) return;
    try {
      await ventasApi.cerrarRonda(ronda.id);
      localStorage.removeItem(RONDA_ACTIVA_KEY(user.id));
      toast("Ronda de venta finalizada");
      navigate("/ventas/historial");
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo finalizar la ronda", "danger");
    }
  };

  const toggleSeleccion = (cosecha) => {
    setCarrito((prev) => {
      const next = new Map(prev);
      if (next.has(cosecha.id)) next.delete(cosecha.id);
      else next.set(cosecha.id, { cosecha, cantidad: 1 });
      return next;
    });
  };

  const setCantidad = (id, cantidad) => {
    setCarrito((prev) => {
      const next = new Map(prev);
      const item = next.get(id);
      if (!item) return prev;
      next.set(id, { ...item, cantidad });
      return next;
    });
  };

  const quitarDelCarrito = (id) => {
    setCarrito((prev) => {
      const next = new Map(prev);
      next.delete(id);
      if (next.size === 0) setShowCarritoModal(false);
      return next;
    });
  };

  const totalCarrito = useMemo(
    () =>
      Array.from(carrito.values()).reduce(
        (sum, it) => sum + (Number(it.cantidad) || 0) * Number(it.cosecha.precio_referencial),
        0
      ),
    [carrito]
  );

  const confirmarVenta = async () => {
    setConfirmando(true);
    try {
      const items = Array.from(carrito.entries()).map(([cosecha_id, it]) => ({
        cosecha_id,
        cantidad: Number(it.cantidad) || 0,
      }));
      const actualizado = await ventasApi.confirmar(ronda.id, items);
      setRonda(actualizado);
      setCarrito(new Map());
      setShowCarritoModal(false);
      toast("Venta registrada");
      cargarProductos();
    } catch (err) {
      toast(err?.response?.data?.detail || "No se pudo registrar la venta", "danger");
    } finally {
      setConfirmando(false);
    }
  };

  if (user?.rol === "admin") {
    return (
      <div className="animate-fade">
        <PageHeader title="Venta ahora" subtitle="Punto de venta directo del productor." />
        <EmptyState
          icon="coins"
          title="Disponible para productores"
          desc="Como administrador puedes revisar y exportar las ventas de todos los productores desde el Historial de ventas."
          action={
            <Button icon="clock" onClick={() => navigate("/ventas/historial")}>
              Ir al historial de ventas
            </Button>
          }
        />
      </div>
    );
  }

  if (loadingRonda) {
    return <EmptyState icon="coins" title="Cargando…" desc="Un momento por favor." />;
  }

  if (!ronda) {
    return (
      <div className="animate-fade">
        <PageHeader title="Venta ahora" subtitle="Punto de venta directo para tus cosechas." />
        <EmptyState
          icon="coins"
          title="Inicia una ronda de venta"
          desc="Dale un nombre a esta sesión de venta (por ejemplo, la feria o minimarket de hoy) para empezar a registrar tus ventas."
          action={<Button icon="plus" onClick={abrirModalNombre}>Nombrar ronda</Button>}
        />
        <NombreRondaModal
          open={showNombreModal}
          sugerido={nombreSugerido}
          value={nombreInput}
          onChange={setNombreInput}
          onClose={() => setShowNombreModal(false)}
          onConfirm={() => iniciarRonda((nombreInput || nombreSugerido).trim())}
          creando={creandoRonda}
        />
        <SeleccionarRondaModal
          open={showSelectorModal}
          loading={loadingSelector}
          rondas={rondasAbiertas}
          onClose={() => setShowSelectorModal(false)}
          onSeleccionar={seleccionarRonda}
          onNueva={abrirModalNombre}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade pb-24">
      <PageHeader
        title="Venta ahora"
        subtitle={`Ronda: ${ronda.nombre} · Inicio ${horaCorta(ronda.hora_inicio)} · ${fmtFecha(ronda.fecha)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon="refresh" onClick={abrirSelectorRondas}>
              Cambiar ronda
            </Button>
            <Button variant="secondary" size="sm" icon="plus" onClick={nuevaRonda}>
              Nueva ronda
            </Button>
            <Button variant="ghost" size="sm" icon="check" onClick={finalizarRonda}>
              Finalizar ronda
            </Button>
          </div>
        }
      />

      {loadingProductos ? (
        <EmptyState icon="coins" title="Cargando tus productos…" desc="Un momento por favor." />
      ) : productos.length === 0 ? (
        <EmptyState
          icon="basket"
          title="No tienes productos disponibles"
          desc="Registra una cosecha con stock disponible en Ofertas para poder venderla aquí."
          action={
            <Button variant="secondary" onClick={() => navigate("/ofertas/cosechas")}>
              Ir a Ofertas
            </Button>
          }
        />
      ) : (
        <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {productos.map((p) => {
            const seleccionado = carrito.has(p.id);
            return (
              <Card
                key={p.id}
                pad="p-0"
                hover
                onClick={() => toggleSeleccion(p)}
                className={`overflow-hidden ${seleccionado ? "ring-2 ring-primary" : ""}`}
              >
                <div className="relative h-[110px]">
                  <Photo
                    src={p.cultivo_imagen}
                    tint={tintFor(p.nombre_producto || "")}
                    height={110}
                    label={(p.nombre_producto || "").toLowerCase()}
                  />
                  {seleccionado && (
                    <span className="absolute right-[10px] top-[10px] grid h-7 w-7 place-items-center rounded-full bg-primary text-white shadow-[0_1px_4px_rgba(0,0,0,.3)]">
                      <Icon name="check" size={16} stroke={2.4} />
                    </span>
                  )}
                </div>
                <div className="p-[14px]">
                  <h3 className="m-0 truncate text-[15px] font-extrabold text-text">{p.nombre_producto}</h3>
                  <div className="mt-[3px] truncate text-[12px] font-semibold text-muted-2">
                    Stock: {p.cantidad} {p.unidad}
                  </div>
                  <div className="mt-[6px] text-[17px] font-extrabold text-terracotta">
                    {fmtMoneda(p.precio_referencial)}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {carrito.size > 0 && (
        <div className="fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 lg:inset-x-auto lg:bottom-8 lg:right-11">
          <Button icon="basket" full className="shadow-toast lg:w-auto" onClick={() => setShowCarritoModal(true)}>
            Ver carrito ({carrito.size}) · {fmtMoneda(totalCarrito)}
          </Button>
        </div>
      )}

      <Modal
        open={showCarritoModal}
        onClose={() => setShowCarritoModal(false)}
        title="Confirmar venta"
        subtitle={`${fmtFecha(localDateStr())} · ${horaCorta(horaLocalStr())} hs`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCarritoModal(false)}>
              Cancelar
            </Button>
            <Button icon="check" onClick={confirmarVenta} disabled={confirmando || carrito.size === 0}>
              {confirmando ? "Registrando…" : `Confirmar · ${fmtMoneda(totalCarrito)}`}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {Array.from(carrito.values()).map((it) => (
            <div key={it.cosecha.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-extrabold text-text">{it.cosecha.nombre_producto}</div>
                <div className="truncate text-[12.5px] text-muted-2">
                  {it.cosecha.cultivo || "Producto de biohuerto"} · {fmtMoneda(it.cosecha.precio_referencial)} /{" "}
                  {it.cosecha.unidad}
                </div>
              </div>
              <Input
                type="number"
                min="0.01"
                max={it.cosecha.cantidad}
                step="0.01"
                value={it.cantidad}
                onChange={(e) => setCantidad(it.cosecha.id, e.target.value)}
                className="!w-20 text-center"
              />
              <div className="w-[92px] flex-shrink-0 text-right text-[15px] font-extrabold text-terracotta">
                {fmtMoneda((Number(it.cantidad) || 0) * Number(it.cosecha.precio_referencial))}
              </div>
              <IconBtn name="x" title="Quitar" onClick={() => quitarDelCarrito(it.cosecha.id)} />
            </div>
          ))}
        </div>
      </Modal>

      <NombreRondaModal
        open={showNombreModal}
        sugerido={nombreSugerido}
        value={nombreInput}
        onChange={setNombreInput}
        onClose={() => setShowNombreModal(false)}
        onConfirm={() => iniciarRonda((nombreInput || nombreSugerido).trim())}
        creando={creandoRonda}
      />
      <SeleccionarRondaModal
        open={showSelectorModal}
        loading={loadingSelector}
        rondas={rondasAbiertas}
        onClose={() => setShowSelectorModal(false)}
        onSeleccionar={seleccionarRonda}
        onNueva={abrirModalNombre}
      />
    </div>
  );
}

function NombreRondaModal({ open, sugerido, value, onChange, onClose, onConfirm, creando }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva ronda de venta"
      subtitle="¿Cómo quieres llamar a esta ronda?"
      footer={
        <Button icon="check" onClick={onConfirm} disabled={creando}>
          {creando ? "Creando…" : "Comenzar"}
        </Button>
      }
    >
      <Field label="Nombre de la ronda" hint="Si ya existe una con este nombre, se le agregará un sufijo automático.">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={sugerido} />
      </Field>
    </Modal>
  );
}

function SeleccionarRondaModal({ open, loading, rondas, onClose, onSeleccionar, onNueva }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rondas de venta abiertas"
      subtitle="Elige con cuál seguir vendiendo, o inicia una nueva."
      footer={
        <Button variant="secondary" icon="plus" onClick={onNueva}>
          Iniciar ronda nueva
        </Button>
      }
    >
      {loading ? (
        <EmptyState icon="coins" title="Cargando rondas…" desc="Un momento por favor." />
      ) : rondas.length === 0 ? (
        <EmptyState icon="coins" title="No tienes rondas abiertas" desc="Inicia una ronda nueva para empezar a vender." />
      ) : (
        <div className="grid gap-3">
          {rondas.map((r) => (
            <Card
              key={r.id}
              pad="p-[14px]"
              hover
              onClick={() => onSeleccionar(r)}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="truncate text-[15px] font-extrabold text-text">{r.nombre}</div>
                <div className="mt-[2px] text-[12.5px] font-semibold text-muted-2">
                  {fmtFecha(r.fecha)} · {horaCorta(r.hora_inicio)} · {r.total_items} producto
                  {r.total_items === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex-shrink-0 text-[16px] font-extrabold text-terracotta">
                {fmtMoneda(r.total_monto)}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ============ Historial de ventas ============ */
function HistorialVentasView() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.rol === "admin";

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [productorId, setProductorId] = useState("");
  const [productores, setProductores] = useState([]);
  const [rondas, setRondas] = useState([]);
  const [ventasPlanas, setVentasPlanas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    usuariosApi
      .list({ rol: "productor" })
      .then((data) => setProductores(Array.isArray(data) ? data : data?.items || []))
      .catch(() => setProductores([]));
  }, [isAdmin]);

  const filtros = useMemo(() => {
    const f = {};
    if (fechaDesde) f.fecha_desde = fechaDesde;
    if (fechaHasta) f.fecha_hasta = fechaHasta;
    if (isAdmin && productorId) f.usuario_id = productorId;
    return f;
  }, [fechaDesde, fechaHasta, productorId, isAdmin]);

  const cargar = async () => {
    setLoading(true);
    try {
      const [r, v] = await Promise.all([ventasApi.listarRondas(filtros), ventasApi.listarVentas(filtros)]);
      setRondas(Array.isArray(r) ? r : r?.items || []);
      setVentasPlanas(Array.isArray(v) ? v : v?.items || []);
    } catch {
      toast("No se pudo cargar el historial de ventas", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, productorId]);

  const rondaNombreMap = useMemo(() => {
    const m = {};
    rondas.forEach((r) => {
      m[r.id] = r.nombre;
    });
    return m;
  }, [rondas]);

  const resumen = useMemo(() => {
    const totalVendido = ventasPlanas.reduce((s, v) => s + Number(v.total), 0);
    const porProducto = {};
    ventasPlanas.forEach((v) => {
      porProducto[v.nombre_producto] = (porProducto[v.nombre_producto] || 0) + Number(v.cantidad);
    });
    const top = Object.entries(porProducto).sort((a, b) => b[1] - a[1])[0];
    return {
      totalVendido,
      totalRondas: rondas.length,
      productoTop: top ? top[0] : "—",
    };
  }, [ventasPlanas, rondas]);

  const abrirDetalle = async (ronda) => {
    try {
      const d = await ventasApi.detalleRonda(ronda.id);
      setDetalle(d);
    } catch {
      toast("No se pudo cargar el detalle de la ronda", "danger");
    }
  };

  const exportarPDF = () => {
    descargarReporteVentas({ rondas, ventasPlanas, resumen });
    toast("Reporte PDF descargado");
  };

  const exportarExcel = () => {
    descargarExcelVentas({ ventasPlanas, resumen, rondaNombreMap });
    toast("Reporte Excel descargado");
  };

  return (
    <div className="animate-fade">
      <PageHeader
        title="Historial de ventas"
        subtitle="Ventas registradas por cada ronda de actividad, con sus totales."
      />

      <Card pad="p-5" className="mb-[26px] !border !border-line" style={{ background: "var(--chip-2)" }}>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <Field label="Desde">
            <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </Field>
          {isAdmin && (
            <Field label="Productor">
              <Select value={productorId} onChange={(e) => setProductorId(e.target.value)}>
                <option value="">Todos los productores</option>
                {productores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Button variant="secondary" icon="download" onClick={exportarPDF} disabled={ventasPlanas.length === 0}>
            Exportar PDF
          </Button>
          <Button variant="secondary" icon="download" onClick={exportarExcel} disabled={ventasPlanas.length === 0}>
            Exportar Excel
          </Button>
        </div>
      </Card>

      <div className="mb-[26px] grid gap-[18px] sm:grid-cols-3">
        <Card pad="p-5">
          <div className="text-[12.5px] font-extrabold uppercase tracking-[.06em] text-muted-2">Total vendido</div>
          <div className="mt-1 text-[22px] font-extrabold text-terracotta">{fmtMoneda(resumen.totalVendido)}</div>
        </Card>
        <Card pad="p-5">
          <div className="text-[12.5px] font-extrabold uppercase tracking-[.06em] text-muted-2">
            Rondas en el rango
          </div>
          <div className="mt-1 text-[22px] font-extrabold text-text">{resumen.totalRondas}</div>
        </Card>
        <Card pad="p-5">
          <div className="text-[12.5px] font-extrabold uppercase tracking-[.06em] text-muted-2">
            Producto más vendido
          </div>
          <div className="mt-1 truncate text-[18px] font-extrabold text-text">{resumen.productoTop}</div>
        </Card>
      </div>

      {loading ? (
        <EmptyState icon="clock" title="Cargando historial…" desc="Un momento por favor." />
      ) : rondas.length === 0 ? (
        <EmptyState
          icon="clock"
          title="Sin ventas en este rango"
          desc="Ajusta los filtros de fecha o registra una venta desde “Venta ahora”."
        />
      ) : (
        <div className="grid gap-[14px]">
          {rondas.map((r) => {
            const estado = ESTADO_RONDA[r.estado] || ESTADO_RONDA.abierta;
            return (
              <Card
                key={r.id}
                pad="p-[18px]"
                hover
                onClick={() => abrirDetalle(r)}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15.5px] font-extrabold text-text">{r.nombre}</span>
                    <Badge bg={estado.bg} fg={estado.fg} dot={estado.dot}>
                      {estado.label}
                    </Badge>
                  </div>
                  <div className="mt-1 text-[12.5px] font-semibold text-muted-2">
                    {fmtFecha(r.fecha)} · {horaCorta(r.hora_inicio)} · {r.total_items} producto
                    {r.total_items === 1 ? "" : "s"}
                    {isAdmin && r.productor ? ` · ${r.productor}` : ""}
                  </div>
                </div>
                <div className="text-right text-[19px] font-extrabold text-terracotta">
                  {fmtMoneda(r.total_monto)}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle?.nombre}
        subtitle={detalle ? `${fmtFecha(detalle.fecha)} · ${horaCorta(detalle.hora_inicio)}` : undefined}
        footer={
          <Button variant="ghost" onClick={() => setDetalle(null)}>
            Cerrar
          </Button>
        }
      >
        <div className="grid gap-3">
          {(detalle?.items || []).map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0">
              <div className="min-w-0">
                <div className="truncate text-[14.5px] font-bold text-text">{it.nombre_producto}</div>
                <div className="text-[12.5px] text-muted-2">
                  {it.cantidad} {it.unidad} · {fmtMoneda(it.precio_unitario)} c/u · {horaCorta(it.hora)}
                </div>
              </div>
              <div className="flex-shrink-0 text-[15px] font-extrabold text-terracotta">{fmtMoneda(it.total)}</div>
            </div>
          ))}
          {detalle && (
            <div className="flex justify-between pt-2 text-[16px] font-extrabold text-text">
              <span>Total</span>
              <span>{fmtMoneda(detalle.total_monto)}</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ---- Genera y descarga el historial de ventas como PDF (estilo manual, igual que Panel.jsx) ---- */
function descargarReporteVentas({ rondas, ventasPlanas, resumen }) {
  const GREEN = [47, 122, 58];
  const GRAY = [107, 117, 108];
  const LINE = [230, 235, 229];
  const TEXT = [28, 42, 32];
  const MUTE = [154, 163, 154];

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 44;
  let y = M;
  const ensure = (h) => {
    if (y + h > pageH - M) {
      doc.addPage();
      y = M;
    }
  };

  doc.setFillColor(...GREEN);
  doc.roundedRect(M, y, 34, 34, 8, 8, "F");
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Historial de ventas", M + 46, y + 15);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Biohuerto · Punto de venta directo", M + 46, y + 30);
  y += 48;
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(2);
  doc.line(M, y, pageW - M, y);
  y += 16;
  doc.setTextColor(...GRAY);
  doc.setFontSize(9.5);
  doc.text(
    `Generado el ${new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}`,
    M,
    y
  );
  y += 22;

  ensure(70);
  doc.setTextColor(...GREEN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RESUMEN", M, y);
  y += 12;
  [
    ["Total vendido", fmtMoneda(resumen.totalVendido)],
    ["Rondas en el rango", String(resumen.totalRondas)],
    ["Producto más vendido", resumen.productoTop],
  ].forEach(([label, value]) => {
    ensure(24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...TEXT);
    doc.text(label, M, y);
    doc.setFont("helvetica", "bold");
    doc.text(String(value), pageW - M, y, { align: "right" });
    y += 8;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(1);
    doc.line(M, y, pageW - M, y);
    y += 13;
  });
  y += 10;

  rondas.forEach((ronda) => {
    ensure(30);
    doc.setTextColor(...GREEN);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${ronda.nombre} · ${fmtFecha(ronda.fecha)}`, M, y);
    doc.setTextColor(...TEXT);
    doc.text(fmtMoneda(ronda.total_monto), pageW - M, y, { align: "right" });
    y += 14;

    const items = ventasPlanas.filter((v) => v.ronda_id === ronda.id);
    items.forEach((it) => {
      ensure(16);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...GRAY);
      doc.text(`${horaCorta(it.hora)}  ${it.nombre_producto}  x${it.cantidad}`, M + 10, y);
      doc.text(fmtMoneda(it.total), pageW - M, y, { align: "right" });
      y += 13;
    });
    y += 10;
  });

  doc.setTextColor(...MUTE);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Biohuerto — Plataforma de gestion sostenible · Documento generado automaticamente",
    pageW / 2,
    pageH - 28,
    { align: "center" }
  );

  doc.save(`historial-ventas-${localDateStr()}.pdf`);
}

/* ---- Genera y descarga el historial de ventas como Excel (hoja Resumen + hoja Ventas) ---- */
function descargarExcelVentas({ ventasPlanas, resumen, rondaNombreMap }) {
  const filas = ventasPlanas.map((v) => ({
    Ronda: rondaNombreMap[v.ronda_id] || v.ronda_id,
    Fecha: v.fecha,
    Hora: horaCorta(v.hora),
    Producto: v.nombre_producto,
    Cultivo: v.cultivo || "",
    Cantidad: Number(v.cantidad),
    Unidad: v.unidad || "",
    "Precio unitario": Number(v.precio_unitario),
    Total: Number(v.total),
  }));
  const wsResumen = XLSX.utils.json_to_sheet([
    { Indicador: "Total vendido", Valor: resumen.totalVendido },
    { Indicador: "Rondas en el rango", Valor: resumen.totalRondas },
    { Indicador: "Producto más vendido", Valor: resumen.productoTop },
  ]);
  const wsVentas = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
  XLSX.utils.book_append_sheet(wb, wsVentas, "Ventas");
  XLSX.writeFile(wb, `historial-ventas-${localDateStr()}.xlsx`);
}
