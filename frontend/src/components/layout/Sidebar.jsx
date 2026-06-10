import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import { alertasApi } from "../../lib/resources.js";
import { useAuth } from "../../context/AuthContext.jsx";

export const MODULES = [
  { id: "panel", label: "Panel", icon: "grid", path: "/panel", group: "main" },
  {
    id: "usuarios",
    label: "Usuarios",
    icon: "users",
    path: "/usuarios",
    group: "main",
    subs: [
      { id: "productores", label: "Productores", path: "/usuarios/productores" },
      { id: "consumidores", label: "Consumidores", path: "/usuarios/consumidores" },
    ],
  },
  { id: "biohuertos", label: "Biohuertos", icon: "sprout", path: "/biohuertos", group: "main" },
  { id: "cultivos", label: "Cultivos", icon: "leaf", path: "/cultivos", group: "main" },
  { id: "fitosanitario", label: "Fitosanitario", icon: "stethoscope", path: "/fitosanitario", group: "tools" },
  { id: "rag", label: "RAG", icon: "database", path: "/rag", group: "tools", roles: ["admin"] },
  { id: "alertas", label: "Alertas", icon: "bell", path: "/alertas", group: "tools" },
  {
    id: "ofertas",
    label: "Ofertas",
    icon: "basket",
    path: "/ofertas",
    group: "tools",
    subs: [
      { id: "cosechas", label: "Gestión de Cosechas", path: "/ofertas/cosechas" },
      { id: "publicaciones", label: "Publicaciones", path: "/ofertas/publicaciones" },
    ],
  },
];

function ModuleItem({ m }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(m.path);
  const hasSubs = !!m.subs;
  const [open, setOpen] = useState(isActive);
  const expanded = hasSubs && (open || isActive);

  const itemCls = `relative flex w-full items-center gap-[13px] rounded-[11px] px-[14px] py-[11px] text-left text-[15px] transition-colors ${
    isActive ? "font-extrabold text-white" : "font-semibold text-white/[.82] hover:bg-white/[.07]"
  }`;
  const itemStyle = isActive
    ? { background: "linear-gradient(180deg, #338a51 0%, #2c7044 100%)" }
    : undefined;

  const inner = (
    <>
      {isActive && (
        <span className="absolute left-0 top-1/2 h-[22px] w-[3.5px] -translate-y-1/2 rounded-r bg-sb-accent" />
      )}
      <Icon name={m.icon} size={20} stroke={1.9} />
      <span className="flex-1">{m.label}</span>
      {m.badge ? (
        <span className="grid h-[21px] min-w-[21px] place-items-center rounded-full bg-sb-badge px-[6px] text-xs font-extrabold text-white">
          {m.badge}
        </span>
      ) : null}
      {hasSubs && (
        <span className={`opacity-60 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <Icon name="chevDown" size={17} />
        </span>
      )}
    </>
  );

  if (hasSubs) {
    return (
      <div>
        <NavLink
          to={m.subs[0].path}
          onClick={() => setOpen((o) => !o)}
          className={itemCls}
          style={itemStyle}
        >
          {inner}
        </NavLink>
        {expanded && (
          <div className="mb-1 mt-[3px] grid gap-[2px] pl-2">
            {m.subs.map((s) => (
              <NavLink
                key={s.id}
                to={s.path}
                className={({ isActive: sa }) =>
                  `flex w-full items-center gap-[10px] rounded-[9px] px-4 py-[9px] text-left text-sm transition-colors ${
                    sa ? "bg-white/[.07] font-extrabold text-white" : "font-semibold text-white/[.46] hover:bg-white/[.07]"
                  }`
                }
              >
                {({ isActive: sa }) => (
                  <>
                    <span
                      className="h-[6px] w-[6px] flex-shrink-0 rounded-full"
                      style={{ background: sa ? "#7ad79a" : "rgba(255,255,255,.3)" }}
                    />
                    {s.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink to={m.path} className={itemCls} style={itemStyle}>
      {inner}
    </NavLink>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const [unseenCount, setUnseenCount] = useState(0);

  const refreshUnseen = async () => {
    try {
      const data = await alertasApi.unseenCount();
      setUnseenCount(data?.count || 0);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshUnseen();
  }, [location.pathname]);

  useEffect(() => {
    const onSeen = () => setUnseenCount(0);
    window.addEventListener("alertas:vista", onSeen);
    return () => window.removeEventListener("alertas:vista", onSeen);
  }, []);

  const modules = MODULES.filter((m) => !m.roles || m.roles.includes(user?.rol)).map((m) =>
    m.id === "alertas" ? { ...m, badge: unseenCount > 0 ? unseenCount : null } : m
  );
  const main = modules.filter((m) => m.group === "main");
  const tools = modules.filter((m) => m.group === "tools");
  return (
    <nav className="flex flex-col gap-1 px-[14px] py-3">
      {main.map((m) => (
        <ModuleItem key={m.id} m={m} />
      ))}
      <div className="px-[14px] pb-2 pt-[18px] text-[11px] font-extrabold tracking-[.1em] text-white/[.46]">
        HERRAMIENTAS
      </div>
      {tools.map((m) => (
        <ModuleItem key={m.id} m={m} />
      ))}
    </nav>
  );
}
