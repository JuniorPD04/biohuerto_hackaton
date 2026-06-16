import { createContext, useCallback, useContext, useState } from "react";
import Icon from "./Icon.jsx";

const ToastContext = createContext(null);

let counter = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const toast = useCallback((msg, tone = "success") => {
    const id = ++counter;
    setItems((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-[26px] right-[26px] z-[200] grid gap-[10px]">
        {items.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-[13px] px-[18px] py-[13px] text-[14.5px] font-bold text-white shadow-toast animate-toastIn"
            style={{ background: t.tone === "danger" ? "#b23a2e" : "var(--primary)" }}
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20">
              <Icon name={t.tone === "danger" ? "x" : "check"} size={15} stroke={3} />
            </span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
