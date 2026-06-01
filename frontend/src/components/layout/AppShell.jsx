import { Activity, BarChart3, BookOpen, Leaf, LineChart, LogOut, RefreshCw, SearchCheck, Store, Sprout, WifiOff } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useOffline } from "../../context/OfflineContext.jsx";

const items = [
  { to: "/", label: "Inicio", icon: BarChart3 },
  { to: "/biohuertos", label: "Huertos", icon: Leaf },
  { to: "/cultivos", label: "Cultivos", icon: Sprout },
  { to: "/monitoreo", label: "Monitoreo", icon: Activity },
  { to: "/diagnostico", label: "Diagnostico", icon: SearchCheck },
  { to: "/mercado", label: "Mercado", icon: Store },
  { to: "/trazabilidad", label: "Trazas", icon: LineChart },
  { to: "/reporte", label: "Reporte", icon: BookOpen },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const { isOnline, pendingCount, syncing, syncPending } = useOffline();

  return (
    <div className="min-h-screen pb-36 sm:pb-20 lg:pb-0">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 border-r border-slate-200 bg-white px-4 py-5 lg:block">
        <Brand />
        <nav className="mt-8 space-y-1">
          {items.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="absolute bottom-5 left-4 right-4">
          <UserBlock user={user} logout={logout} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/92 px-4 py-3 backdrop-blur lg:ml-64">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Brand compact />
          <div className="flex items-center gap-2">
            <SyncBadge isOnline={isOnline} pendingCount={pendingCount} syncing={syncing} syncPending={syncPending} />
            <span className="hidden text-sm font-medium text-slate-600 sm:block">{user?.nombre}</span>
            <button className="icon-button" onClick={logout} title="Cerrar sesion" type="button">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 lg:ml-64 lg:px-8 lg:py-7">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white sm:grid-cols-8 lg:hidden">
        {items.map((item) => (
          <MobileNavItem key={item.to} {...item} />
        ))}
      </nav>
    </div>
  );
}

function SyncBadge({ isOnline, pendingCount, syncing, syncPending }) {
  if (pendingCount === 0 && isOnline) return null;
  return (
    <button
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-bold ${
        isOnline ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
      }`}
      onClick={syncPending}
      type="button"
      title="Sincronizar cambios pendientes"
    >
      {isOnline ? <RefreshCw className={syncing ? "animate-spin" : ""} size={15} /> : <WifiOff size={15} />}
      {pendingCount} pendientes
    </button>
  );
}

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-leaf-800 text-white">
        <Sprout size={22} />
      </div>
      {!compact && (
        <div>
          <p className="text-sm font-bold text-slate-950">Biohuerto</p>
          <p className="text-xs text-slate-500">Gestion sostenible</p>
        </div>
      )}
      {compact && <p className="text-sm font-bold text-slate-950">Biohuerto</p>}
    </div>
  );
}

function NavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
          isActive ? "bg-leaf-50 text-leaf-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

function MobileNavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
          isActive ? "text-leaf-800" : "text-slate-500"
        }`
      }
    >
      <Icon size={20} />
      <span className="max-w-full truncate px-1">{label}</span>
    </NavLink>
  );
}

function UserBlock({ user, logout }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="truncate text-sm font-semibold text-slate-900">{user?.nombre}</p>
      <p className="truncate text-xs text-slate-500">{user?.email}</p>
      <button
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-leaf-700 hover:text-leaf-800"
        onClick={logout}
        type="button"
      >
        <LogOut size={16} />
        Salir
      </button>
    </div>
  );
}
