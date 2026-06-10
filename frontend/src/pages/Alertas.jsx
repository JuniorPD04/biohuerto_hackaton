import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Badge,
  Field,
  Select,
  EmptyState,
  PageHeader,
  PrioridadBadge,
  Icon,
} from "../components/ui/primitives.jsx";
import { useToast } from "../components/ui/Toast.jsx";
import { alertasApi } from "../lib/resources.js";

const RANK = { alta: 0, media: 1, baja: 2 };

const TIPOS = [
  "Riego",
  "Fertilización",
  "Control preventivo",
  "Cosecha",
  "Rotación de cultivos",
  "Otro",
];

// Fecha programada como en el diseño: "2025-10-02 06:00".
function fmtFechaHora(iso) {
  if (!iso) return "—";
  const s = String(iso).replace("T", " ");
  const [date, time = ""] = s.split(" ");
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

export default function Alertas() {
  const toast = useToast();
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState("prioridad");
  const [tipoF, setTipoF] = useState("");
  const [bioF, setBioF] = useState("");
  const [cultivoF, setCultivoF] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await alertasApi.list();
      setAlertas(Array.isArray(data) ? data : data?.items || []);
    } catch {
      toast("No se pudieron cargar las alertas", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    alertasApi
      .markSeen()
      .then(() => window.dispatchEvent(new Event("alertas:vista")))
      .catch(() => {});
  }, []);

  const pendientes = alertas.filter((a) => a.estado === "pendiente");
  const biohuertos = useMemo(
    () => [...new Set(alertas.map((a) => a.biohuerto).filter((b) => b && b !== "—"))],
    [alertas]
  );
  const cultivos = useMemo(
    () => [...new Set(alertas.map((a) => a.cultivo).filter((c) => c && c !== "—"))],
    [alertas]
  );

  let list = pendientes.filter(
    (a) =>
      (!tipoF || a.tipo === tipoF) &&
      (!bioF || a.biohuerto === bioF) &&
      (!cultivoF || a.cultivo === cultivoF)
  );
  list = [...list].sort((a, b) =>
    orden === "prioridad"
      ? (RANK[a.prioridad] ?? 9) - (RANK[b.prioridad] ?? 9)
      : new Date(b.fecha_programada) - new Date(a.fecha_programada)
  );

  return (
    <div className="animate-fade">
      <PageHeader
        title="Alertas y recordatorios"
        subtitle="Recordatorios de riego, fertilización orgánica, control preventivo, cosecha y rotación de cultivos."
        action={
          <Badge bg="#fbe1de" fg="#b23a2e" dot="#d6584a" className="!px-[14px] !py-2 !text-sm">
            {pendientes.length} pendientes
          </Badge>
        }
      />

      <Card
        pad="p-5"
        className="mb-[26px] !border !border-line"
        style={{ background: "var(--chip-2)" }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Tipo de alerta">
            <Select value={tipoF} onChange={(e) => setTipoF(e.target.value)}>
              <option value="">Todos los tipos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Biohuerto">
            <Select value={bioF} onChange={(e) => setBioF(e.target.value)}>
              <option value="">Todos los biohuertos</option>
              {biohuertos.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cultivo">
            <Select value={cultivoF} onChange={(e) => setCultivoF(e.target.value)}>
              <option value="">Todos los cultivos</option>
              {cultivos.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ordenar por">
            <Select value={orden} onChange={(e) => setOrden(e.target.value)}>
              <option value="prioridad">Prioridad</option>
              <option value="fecha">Fecha</option>
            </Select>
          </Field>
        </div>
      </Card>

      {loading ? (
        <EmptyState icon="bell" title="Cargando alertas…" desc="Un momento por favor." />
      ) : list.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Sin alertas para estos filtros"
          desc="No hay recordatorios que coincidan con los filtros seleccionados."
        />
      ) : (
        <div className="grid gap-3">
          {list.map((a) => {
            return (
              <Card key={a.id} pad="p-5">
                <div className="flex flex-wrap items-center gap-[18px]">
                  <div className="flex min-w-[240px] flex-1 flex-col gap-[7px]">
                    <div className="text-[16.5px] font-extrabold leading-[1.3] text-text">
                      {a.titulo}
                      <span className="ml-[10px] inline-flex align-middle">
                        <PrioridadBadge prioridad={a.prioridad} />
                      </span>
                      {a.es_automatica && (
                        <span className="ml-2 inline-flex align-middle">
                          <Badge bg="#eef2ec" fg="#6e786f" dot="#9aa39a">
                            Automática
                          </Badge>
                        </span>
                      )}
                    </div>
                    {a.descripcion && (
                      <p className="m-0 text-sm text-muted-1">{a.descripcion}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-[13px] text-muted-2">
                      {a.biohuerto && (
                        <span className="inline-flex items-center gap-[5px]">
                          <Icon name="pin" size={14} />
                          {a.biohuerto}
                        </span>
                      )}
                      {a.cultivo && (
                        <span className="inline-flex items-center gap-[5px]">
                          <Icon name="sprout" size={14} />
                          {a.cultivo}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-[5px]"
                        style={{ fontFamily: "var(--mono)" }}
                      >
                        <Icon name="clock" size={14} />
                        {fmtFechaHora(a.fecha_programada)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
