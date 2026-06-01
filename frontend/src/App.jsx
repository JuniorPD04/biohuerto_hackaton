import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import Biohuertos from "./pages/Biohuertos.jsx";
import Cultivos from "./pages/Cultivos.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Diagnostico from "./pages/Diagnostico.jsx";
import Login from "./pages/Login.jsx";
import Mercado from "./pages/Mercado.jsx";
import Monitoreo from "./pages/Monitoreo.jsx";
import Register from "./pages/Register.jsx";
import Reporte from "./pages/Reporte.jsx";
import Trazabilidad from "./pages/Trazabilidad.jsx";

function Protected({ children }) {
  const { booting, isAuthenticated } = useAuth();
  if (booting) {
    return <BootScreen />;
  }
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function GuestOnly({ children }) {
  const { booting, isAuthenticated } = useAuth();
  if (booting) return <BootScreen />;
  return isAuthenticated ? <Navigate to="/" replace /> : children;
}

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="panel w-full max-w-sm p-5">
        <div className="h-2 w-24 rounded bg-leaf-700" />
        <div className="mt-5 h-4 w-3/4 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-1/2 rounded bg-slate-200" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestOnly>
            <Login />
          </GuestOnly>
        }
      />
      <Route
        path="/registro"
        element={
          <GuestOnly>
            <Register />
          </GuestOnly>
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="biohuertos" element={<Biohuertos />} />
        <Route path="cultivos" element={<Cultivos />} />
        <Route path="monitoreo" element={<Monitoreo />} />
        <Route path="diagnostico" element={<Diagnostico />} />
        <Route path="mercado" element={<Mercado />} />
        <Route path="trazabilidad" element={<Trazabilidad />} />
        <Route path="reporte" element={<Reporte />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
