import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ToastProvider } from "./components/ui/Toast.jsx";
import { ConfirmProvider } from "./components/ui/Confirm.jsx";
import { OfflineProvider } from "./context/OfflineContext.jsx";
import PwaManager from "./components/pwa/PwaManager.jsx";
import LocalSecurityGate from "./components/pwa/LocalSecurityGate.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <OfflineProvider>
            <ConfirmProvider>
              <LocalSecurityGate><App /></LocalSecurityGate>
              <PwaManager />
            </ConfirmProvider>
          </OfflineProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
