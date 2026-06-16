import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Panel from "./pages/Panel.jsx";
import Usuarios from "./pages/Usuarios.jsx";
import Biohuertos from "./pages/Biohuertos.jsx";
import Cultivos from "./pages/Cultivos.jsx";
import CultivoWorkspace from "./pages/CultivoWorkspace.jsx";
import Fitosanitario from "./pages/Fitosanitario.jsx";
import Alertas from "./pages/Alertas.jsx";
import Ofertas from "./pages/Ofertas.jsx";
import Rag from "./pages/Rag.jsx";
import Campanias from "./pages/Campanias.jsx";
import Incidencias from "./pages/Incidencias.jsx";
import Monitoreo from "./pages/Monitoreo.jsx";
import Cuidados from "./pages/Cuidados.jsx";
import Trazabilidad from "./pages/Trazabilidad.jsx";
import RolesAccesos from "./pages/RolesAccesos.jsx";
import Entidades from "./pages/Entidades.jsx";
import Mercado from "./pages/Mercado.jsx";

function BootScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg">
      <div className="flex items-center gap-3 text-muted-2">
        <span className="h-3 w-3 animate-pulse rounded-full bg-primary" />
        Cargando…
      </div>
    </div>
  );
}

function Protected({ children }) {
  const { booting, isAuthenticated } = useAuth();
  if (booting) return <BootScreen />;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function GuestOnly({ children }) {
  const { booting, isAuthenticated, user } = useAuth();
  if (booting) return <BootScreen />;
  return isAuthenticated ? <Navigate to={defaultPath(user)} replace /> : children;
}

function defaultPath(user) {
  return user?.rol === "consumidor" ? "/mercado" : "/panel";
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route
        path="/"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="panel" element={<Panel />} />
        <Route path="mercado" element={<Mercado />} />
        <Route path="usuarios" element={<Navigate to="/usuarios/productores" replace />} />
        <Route path="usuarios/:tab" element={<Usuarios />} />
        <Route path="biohuertos" element={<Biohuertos />} />
        <Route path="cultivos" element={<Cultivos />} />
        <Route path="cultivos/:id" element={<CultivoWorkspace />} />
        <Route path="campanias" element={<Campanias />} />
        <Route path="monitoreo" element={<Monitoreo />} />
        <Route path="incidencias" element={<Incidencias />} />
        <Route path="cuidados" element={<Cuidados />} />
        <Route path="trazabilidad" element={<Trazabilidad />} />
        <Route path="fitosanitario" element={<Fitosanitario />} />
        <Route path="rag" element={<Rag />} />
        <Route path="alertas" element={<Alertas />} />
        <Route path="ofertas" element={<Navigate to="/ofertas/cosechas" replace />} />
        <Route path="ofertas/:tab" element={<Ofertas />} />
        <Route path="roles" element={<RolesAccesos />} />
        <Route path="entidades" element={<Entidades />} />
      </Route>
      <Route path="*" element={<FallbackHome />} />
    </Routes>
  );
}

function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={defaultPath(user)} replace />;
}

function FallbackHome() {
  const { user, isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? defaultPath(user) : "/login"} replace />;
}
