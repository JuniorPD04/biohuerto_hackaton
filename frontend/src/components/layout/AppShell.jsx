import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../ui/Toast.jsx";
import Icon from "../ui/Icon.jsx";
import { Avatar } from "../ui/primitives.jsx";
import { tintFor } from "../../lib/theme.js";
import Sidebar from "./Sidebar.jsx";
import logo from "../../assets/logo_biohuerto.jpeg";

const ROL_LABEL = { admin: "Administrador", productor: "Productor", consumidor: "Consumidor" };

export default function AppShell() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const nombre = user?.nombre || "Usuario";

  return (
    <div className="grid h-screen grid-cols-[264px_1fr] bg-bg">
      {/* Sidebar */}
      <aside className="flex h-screen flex-col overflow-hidden bg-sb-bg">
        {/* Brand */}
        <div className="flex items-center gap-3 border-b border-white/10 px-[22px] pb-5 pt-6">
          <img
            src={logo}
            alt="Biohuerto"
            className="h-[42px] w-[42px] flex-shrink-0 rounded-xl object-cover"
          />
          <div>
            <div className="text-xl font-extrabold leading-none text-white">Biohuerto</div>
            <div className="mt-1 text-[12.5px] font-semibold text-white/[.46]">Gestión sostenible</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-3">
          <Sidebar />
        </div>

        {/* User footer */}
        <div className="border-t border-white/10 px-[18px] py-[14px]">
          <div className="flex items-center gap-3">
            <Avatar name={nombre} tint={tintFor(nombre)} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-extrabold leading-none text-white">{nombre}</div>
              <div className="mt-[3px] text-[12.5px] text-white/[.46]">{ROL_LABEL[user?.rol] || user?.rol}</div>
            </div>
            <button
              title="Cerrar sesión"
              onClick={async () => {
                await logout();
                toast("Sesión cerrada");
              }}
              className="grid h-[34px] w-[34px] flex-shrink-0 place-items-center rounded-[9px] border-none bg-transparent text-white/[.46] transition-colors hover:bg-white/[.07] hover:text-white"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="h-screen overflow-y-auto">
        <div className="mx-auto max-w-[1320px] px-11 pb-16 pt-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
