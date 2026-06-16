import { useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  SearchInput,
  Icon,
} from "../components/ui/primitives.jsx";
import { accesoApi } from "../lib/resources.js";
import { useToast } from "../components/ui/Toast.jsx";

/* Estilo (icono + color) por acción → cabecera de columna y celdas. */
const ACTION_META = {
  ver_lista: { icon: "eye", color: "#2f6ba8", bg: "#dbe9f6" },
  ver_detalle: { icon: "eye", color: "#2f6ba8", bg: "#dbe9f6" },
  crear: { icon: "plus", color: "#2f7d3a", bg: "#dcefd7" },
  editar: { icon: "edit", color: "#9a7b16", bg: "#fbf0c9" },
  eliminar: { icon: "trash", color: "#b23a2e", bg: "#fbe1de" },
  dar_baja: { icon: "ban", color: "#6b4ea8", bg: "#e8e1f6" },
  restaurar: { icon: "refresh", color: "#1f7a6a", bg: "#d7f0ea" },
  buscar: { icon: "search", color: "#5a625a", bg: "#eef2ec" },
  exportar: { icon: "download", color: "#2f7d3a", bg: "#dcefd7" },
};
const accMeta = (codigo) => ACTION_META[codigo] || { icon: "check", color: "#5a625a", bg: "#eef2ec" };

/* Estilo por rol → tarjetas superiores. */
const ROL_META = {
  admin: { icon: "shield", grad: "linear-gradient(135deg, #e0863f, #d97328)" },
  productor: { icon: "sprout", grad: "linear-gradient(135deg, #3f9a55, #2f8042)" },
  consumidor: { icon: "store", grad: "linear-gradient(135deg, #b07a3a, #9a6528)" },
};
const rolMeta = (codigo) => ROL_META[codigo] || { icon: "users", grad: "linear-gradient(135deg, #6e786f, #4a514a)" };

/* Agrupación de vistas en secciones de la matriz (según módulo). */
const SECTIONS = [
  { label: "General", modulos: ["panel"] },
  { label: "Usuarios", modulos: ["usuarios"] },
  {
    label: "Operación",
    modulos: [
      "biohuertos", "cultivos", "campanias", "monitoreo", "incidencias",
      "cuidados", "diagnosticos", "alertas", "trazabilidad", "costos",
    ],
  },
  { label: "Ofertas", modulos: ["cosechas"] },
];

const pkey = (v, a) => `${v}:${a}`;

export default function RolesAccesos() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selRol, setSelRol] = useState(null);
  const [search, setSearch] = useState("");
  // edits: { [rolId]: Set("vistaId:accionId") }
  const [edits, setEdits] = useState({});
  const [savingRol, setSavingRol] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await accesoApi.matriz();
      setData(d);
      const init = {};
      for (const r of d.roles) init[r.id] = new Set(r.permisos.map(([v, a]) => pkey(v, a)));
      setEdits(init);
      setSelRol((prev) => prev ?? d.roles[0]?.id ?? null);
    } catch {
      toast("No se pudo cargar la matriz de permisos", "danger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rol = useMemo(() => data?.roles.find((r) => r.id === selRol) || null, [data, selRol]);
  const curSet = (selRol != null && edits[selRol]) || new Set();

  // Pares aplicables totales (universo) y por acción.
  const universe = useMemo(() => {
    const all = [];
    const byAccion = {};
    if (data) {
      for (const v of data.vistas) {
        for (const a of v.aplicables) {
          all.push([v.id, a]);
          byAccion[a] = (byAccion[a] || 0) + 1;
        }
      }
    }
    return { all, byAccion };
  }, [data]);

  // Guarda al instante: actualización optimista + PUT; revierte si falla.
  const persist = async (rolId, prevSet, nextSet) => {
    setEdits((prev) => ({ ...prev, [rolId]: nextSet }));
    setSavingRol(rolId);
    try {
      await accesoApi.setPermisos(rolId, [...nextSet].map((k) => k.split(":").map(Number)));
    } catch {
      setEdits((prev) => ({ ...prev, [rolId]: prevSet }));
      toast("No se pudo guardar el cambio", "danger");
    } finally {
      setSavingRol((r) => (r === rolId ? null : r));
    }
  };

  const toggle = (vistaId, accionId) => {
    if (selRol == null) return;
    const next = new Set(curSet);
    const k = pkey(vistaId, accionId);
    next.has(k) ? next.delete(k) : next.add(k);
    persist(selRol, curSet, next);
  };

  const toggleRow = (vista) => {
    if (selRol == null) return;
    const allOn = vista.aplicables.every((a) => curSet.has(pkey(vista.id, a)));
    const next = new Set(curSet);
    for (const a of vista.aplicables) {
      const k = pkey(vista.id, a);
      allOn ? next.delete(k) : next.add(k);
    }
    persist(selRol, curSet, next);
  };

  const setAll = (on) => {
    if (selRol == null) return;
    const next = on ? new Set(universe.all.map(([v, a]) => pkey(v, a))) : new Set();
    persist(selRol, curSet, next);
  };

  if (loading) {
    return (
      <div className="animate-fade">
        <PageHeader title="Roles y accesos" subtitle="Asigna qué vistas y acciones puede usar cada rol del sistema." />
        <Card pad="p-8" className="text-center text-muted-2">Cargando matriz…</Card>
      </div>
    );
  }
  if (!data) return null;

  const total = data.total_asignable;
  const acciones = data.acciones;

  // Filtra vistas por búsqueda y arma secciones con contenido.
  const q = search.trim().toLowerCase();
  const matches = (v) =>
    !q || v.nombre.toLowerCase().includes(q) || v.codigo.toLowerCase().includes(q) || (v.modulo || "").includes(q);
  const usados = new Set();
  const sections = SECTIONS.map((sec) => {
    const vistas = data.vistas.filter((v) => sec.modulos.includes(v.modulo) && matches(v));
    vistas.forEach((v) => usados.add(v.id));
    return { ...sec, vistas };
  }).filter((s) => s.vistas.length);
  const otras = data.vistas.filter((v) => !usados.has(v.id) && matches(v));
  if (otras.length) sections.push({ label: "Otros", vistas: otras });

  // Plantilla de columnas de la matriz.
  const template = `minmax(220px,1.5fr) repeat(${acciones.length}, minmax(92px,1fr)) 60px`;

  const grantedFor = (accionId) =>
    data.vistas.reduce((n, v) => n + (v.aplicables.includes(accionId) && curSet.has(pkey(v.id, accionId)) ? 1 : 0), 0);

  const rm = rolMeta(rol?.codigo);
  const curCount = curSet.size;
  const pct = total ? Math.round((curCount / total) * 100) : 0;

  return (
    <div className="animate-fade">
      <PageHeader
        title="Roles y accesos"
        subtitle="Asigna qué vistas y acciones puede usar cada rol del sistema."
      />

      {/* Tarjetas de rol */}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {data.roles.map((r) => {
          const m = rolMeta(r.codigo);
          const count = (edits[r.id] || new Set()).size;
          const active = r.id === selRol;
          return (
            <Card
              key={r.id}
              pad="p-5"
              onClick={() => setSelRol(r.id)}
              className={`relative cursor-pointer transition-all ${
                active ? "ring-2 ring-primary" : "hover:-translate-y-[2px] hover:shadow-cardHover"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[13px] text-white" style={{ background: m.grad }}>
                  <Icon name={m.icon} size={22} stroke={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-extrabold text-text">{r.nombre}</div>
                  <div className="font-mono text-[11.5px] uppercase tracking-wide text-muted-3">{r.codigo}</div>
                </div>
                {active && (
                  <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary text-white">
                    <Icon name="check" size={14} stroke={2.6} />
                  </span>
                )}
              </div>
              <p className="mt-3 min-h-[40px] text-[13.5px] leading-snug text-muted-2">{r.descripcion}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-[6px] rounded-full bg-chip px-[11px] py-1 text-[12.5px] font-bold text-muted-1">
                  <Icon name="lock" size={13} /> {count} permisos
                </span>
                <span className="text-[12.5px] text-muted-3">de {total}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Resumen del rol seleccionado */}
      <Card pad="p-5" className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-[13px] text-white" style={{ background: rm.grad }}>
            <Icon name={rm.icon} size={22} stroke={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-extrabold text-text">Permisos de {rol?.nombre}</div>
            <div className="text-[13px] text-muted-2">{curCount} de {total} acciones habilitadas</div>
          </div>
          <SearchInput
            className="w-full sm:w-[300px]"
            placeholder="Buscar vista o módulo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon="shieldCheck" onClick={() => setAll(true)}>Activar todo</Button>
            <Button variant="ghost" size="sm" icon="lock" onClick={() => setAll(false)}>Quitar todo</Button>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-chip">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: rm.grad }} />
        </div>
      </Card>

      {/* Matriz */}
      <Card pad="" className="overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 220 + acciones.length * 92 + 60 }}>
            {/* Cabecera */}
            <div
              className="grid items-end gap-2 border-b border-line bg-chip-2 px-5 py-3"
              style={{ gridTemplateColumns: template }}
            >
              <div className="text-[12px] font-extrabold uppercase tracking-wide text-muted-2">Vista / Acción</div>
              {acciones.map((a) => {
                const m = accMeta(a.codigo);
                return (
                  <div key={a.id} className="flex flex-col items-center gap-1 text-center">
                    <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: m.bg, color: m.color }}>
                      <Icon name={m.icon} size={15} stroke={2} />
                    </span>
                    <span className="text-[12px] font-extrabold text-text">{a.nombre}</span>
                    <span className="font-mono text-[10.5px] text-muted-3">{grantedFor(a.id)}/{universe.byAccion[a.id] || 0}</span>
                  </div>
                );
              })}
              <div />
            </div>

            {/* Secciones */}
            {sections.map((sec) => (
              <div key={sec.label}>
                <div className="border-b border-line bg-chip-3 px-5 py-2 text-[11.5px] font-extrabold uppercase tracking-wide text-muted-2">
                  {sec.label}
                </div>
                {sec.vistas.map((v) => {
                  const rowAllOn = v.aplicables.length > 0 && v.aplicables.every((a) => curSet.has(pkey(v.id, a)));
                  return (
                    <div
                      key={v.id}
                      className="grid items-center gap-2 border-b border-line px-5 py-3 last:border-b-0 hover:bg-chip-3/60"
                      style={{ gridTemplateColumns: template }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-chip text-muted-2">
                          <Icon name="eye" size={16} />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-extrabold text-text">{v.nombre}</div>
                          <div className="truncate font-mono text-[11px] text-muted-3">{v.codigo}</div>
                        </div>
                      </div>
                      {acciones.map((a) => {
                        const applicable = v.aplicables.includes(a.id);
                        const on = curSet.has(pkey(v.id, a.id));
                        const m = accMeta(a.codigo);
                        return (
                          <div key={a.id} className="flex justify-center">
                            {!applicable ? (
                              <span className="text-muted-3">–</span>
                            ) : on ? (
                              <button
                                onClick={() => toggle(v.id, a.id)}
                                className="grid h-[26px] w-[26px] place-items-center rounded-[7px] transition-transform hover:scale-105"
                                style={{ background: m.color }}
                                title={`${a.nombre}: habilitado`}
                              >
                                <Icon name="check" size={15} stroke={2.8} className="text-white" />
                              </button>
                            ) : (
                              <button
                                onClick={() => toggle(v.id, a.id)}
                                className="h-[26px] w-[26px] rounded-[7px] border-[1.5px] border-line-2 bg-white transition-colors hover:border-primary"
                                title={`${a.nombre}: deshabilitado`}
                              />
                            )}
                          </div>
                        );
                      })}
                      <div className="flex justify-center">
                        <button
                          onClick={() => toggleRow(v)}
                          title={rowAllOn ? "Quitar toda la fila" : "Activar toda la fila"}
                          className={`grid h-7 w-7 place-items-center rounded-lg transition-colors ${
                            rowAllOn ? "bg-accent-50 text-primary" : "text-muted-3 hover:bg-chip"
                          }`}
                        >
                          <Icon name={rowAllOn ? "shieldCheck" : "shield"} size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

    </div>
  );
}
