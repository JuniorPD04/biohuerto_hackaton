import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../ui/Toast.jsx";
import Icon from "../ui/Icon.jsx";
import { Avatar } from "../ui/primitives.jsx";
import { tintFor } from "../../lib/theme.js";
import Sidebar from "./Sidebar.jsx";
import SyncCenter from "../pwa/SyncCenter.jsx";
import logo from "../../assets/logo_biohuerto.jpeg";
import { enableNotifications, isIos, isStandalone } from "../../lib/notifications.js";

const ROL_LABEL = { admin: "Superadministrador", productor: "Productor", consumidor: "Consumidor" };

export default function AppShell() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const nombre = user?.nombre || "Usuario";

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const mobileItems = useMemo(() => {
    if (user?.rol === "consumidor") return [{ label: "Mercado", path: "/mercado", icon: "store" }];
    return [
      { label: "Panel", path: "/panel", icon: "grid" },
      { label: "Huertos", path: "/biohuertos", icon: "sprout" },
      { label: "Cultivos", path: "/cultivos", icon: "leaf" },
      { label: "Alertas", path: "/alertas", icon: "bell" },
    ];
  }, [user?.rol]);

  const closeSession = async () => {
    await logout();
    toast("Sesion cerrada");
  };

  return (
    <div className="min-h-[100dvh] bg-bg lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden h-[100dvh] flex-col overflow-hidden bg-sb-bg lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto pb-3"><Sidebar /></div>
        <UserFooter user={user} nombre={nombre} onLogout={closeSession} />
      </aside>

      <header className="sticky top-0 z-40 flex min-h-[64px] items-center gap-3 border-b border-line bg-white/95 px-4 pb-2 pt-[calc(8px+env(safe-area-inset-top))] backdrop-blur lg:hidden">
        <img src={logo} alt="Biohuerto" className="h-10 w-10 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-text">{nombre}</div>
          <div className="text-xs font-semibold text-muted-2">{ROL_LABEL[user?.rol] || user?.rol}</div>
        </div>
        <SyncCenter />
      </header>

      <main className="min-h-0 lg:h-[100dvh] lg:overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-4 pb-[calc(92px+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-11 lg:pb-16 lg:pt-7">
          <div className="mb-2 hidden justify-end lg:flex"><SyncCenter /></div>
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex min-h-[68px] items-start justify-around border-t border-line bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur lg:hidden">
        {mobileItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `flex min-h-[58px] min-w-[58px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-extrabold ${isActive ? "bg-accent-50 text-primary" : "text-muted-2"}`}
          >
            <Icon name={item.icon} size={21} />
            {item.label}
          </NavLink>
        ))}
        <button className="flex min-h-[58px] min-w-[58px] flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-extrabold text-muted-2" onClick={() => setMenuOpen(true)}>
          <Icon name="list" size={21} />
          Mas
        </button>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[90] flex items-end bg-[rgba(18,30,22,.48)] lg:hidden" onClick={() => setMenuOpen(false)}>
          <section className="max-h-[86dvh] w-full overflow-y-auto rounded-t-[22px] bg-sb-bg pb-[calc(16px+env(safe-area-inset-bottom))] shadow-modal" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-sb-bg px-5 py-4 text-white">
              <div className="flex items-center gap-3"><Avatar name={nombre} tint={tintFor(nombre)} size={40} /><span className="font-extrabold">Menu</span></div>
              <button className="grid h-11 w-11 place-items-center rounded-xl hover:bg-white/10" onClick={() => setMenuOpen(false)}><Icon name="x" /></button>
            </div>
            <Sidebar />
            <div className="px-4 pt-3">
              <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 font-extrabold text-white" onClick={closeSession}>
                <Icon name="logout" /> Cerrar sesion
              </button>
            </div>
          </section>
        </div>
      )}
      <NotificationNudge user={user} toast={toast} />
    </div>
  );
}

function NotificationNudge({ user, toast }) {
  const storageKey = `biohuerto:notification-nudge:${user?.id}`;
  const supported = typeof Notification !== "undefined" && Notification.permission === "default";
  const [visible, setVisible] = useState(() => supported && localStorage.getItem(storageKey) !== "dismissed");
  if (!visible) return null;
  const activate = async () => {
    try {
      const result = await enableNotifications();
      if (result.permission === "granted") toast("Notificaciones activadas");
      setVisible(false);
    } catch (error) { toast(error.message, "danger"); }
  };
  return (
    <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-3 right-3 z-50 rounded-2xl border border-line bg-white p-4 shadow-toast md:bottom-5 md:left-auto md:right-5 md:w-[390px] lg:bottom-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-accent-50 text-primary"><Icon name="bell" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-text">¿Activar recordatorios?</p>
          <p className="mt-1 text-sm leading-5 text-muted-2">Alertas importantes y cuidados pendientes. Es opcional.</p>
          {isIos() && !isStandalone() && <p className="mt-1 text-xs font-semibold text-[#80501e]">En iPhone, instala primero la app.</p>}
          <div className="mt-3 flex gap-2">
            <button className="min-h-11 rounded-xl bg-primary px-4 text-sm font-extrabold text-white" onClick={activate}>Activar</button>
            <button className="min-h-11 px-3 text-sm font-extrabold text-muted-2" onClick={() => { localStorage.setItem(storageKey, "dismissed"); setVisible(false); }}>Ahora no</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 px-[22px] pb-5 pt-6">
      <img src={logo} alt="Biohuerto" className="h-[42px] w-[42px] flex-shrink-0 rounded-xl object-cover" />
      <div><div className="text-xl font-extrabold leading-none text-white">Biohuerto</div><div className="mt-1 text-[12.5px] font-semibold text-white/[.46]">Gestion sostenible</div></div>
    </div>
  );
}

function UserFooter({ user, nombre, onLogout }) {
  return (
    <div className="border-t border-white/10 px-[18px] py-[14px]">
      <div className="flex items-center gap-3">
        <Avatar name={nombre} tint={tintFor(nombre)} size={40} />
        <div className="min-w-0 flex-1"><div className="truncate text-[14.5px] font-extrabold leading-none text-white">{nombre}</div><div className="mt-[3px] text-[12.5px] text-white/[.46]">{ROL_LABEL[user?.rol] || user?.rol}</div></div>
        <button title="Cerrar sesion" onClick={onLogout} className="grid h-11 w-11 place-items-center rounded-xl text-white/[.55] hover:bg-white/[.07] hover:text-white"><Icon name="logout" size={18} /></button>
      </div>
    </div>
  );
}
