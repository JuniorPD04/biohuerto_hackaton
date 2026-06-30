import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import AppShell from "./components/layout/AppShell.jsx";
import { useAuth } from "./context/AuthContext.jsx";

const Login = lazy(() => import("./pages/Login.jsx"));
const Panel = lazy(() => import("./pages/Panel.jsx"));
const Usuarios = lazy(() => import("./pages/Usuarios.jsx"));
const Biohuertos = lazy(() => import("./pages/Biohuertos.jsx"));
const Cultivos = lazy(() => import("./pages/Cultivos.jsx"));
const CultivoWorkspace = lazy(() => import("./pages/CultivoWorkspace.jsx"));
const Fitosanitario = lazy(() => import("./pages/Fitosanitario.jsx"));
const Alertas = lazy(() => import("./pages/Alertas.jsx"));
const Ofertas = lazy(() => import("./pages/Ofertas.jsx"));
const Rag = lazy(() => import("./pages/Rag.jsx"));
const Campanias = lazy(() => import("./pages/Campanias.jsx"));
const Incidencias = lazy(() => import("./pages/Incidencias.jsx"));
const Monitoreo = lazy(() => import("./pages/Monitoreo.jsx"));
const Cuidados = lazy(() => import("./pages/Cuidados.jsx"));
const Trazabilidad = lazy(() => import("./pages/Trazabilidad.jsx"));
const RolesAccesos = lazy(() => import("./pages/RolesAccesos.jsx"));
const Entidades = lazy(() => import("./pages/Entidades.jsx"));
const Mercado = lazy(() => import("./pages/Mercado.jsx"));
const NotificacionesAdmin = lazy(() => import("./pages/NotificacionesAdmin.jsx"));

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

function AdminOnly({ children }) {
  const { user } = useAuth();
  return user?.rol === "admin" ? children : <Navigate to={defaultPath(user)} replace />;
}

function defaultPath(user) {
  return user?.rol === "consumidor" ? "/mercado" : "/panel";
}

export default function App() {
  return (
    <Suspense fallback={<BootScreen />}><Routes>
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
        <Route path="notificaciones" element={<AdminOnly><NotificacionesAdmin /></AdminOnly>} />
      </Route>
      <Route path="*" element={<FallbackHome />} />
    </Routes></Suspense>
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
