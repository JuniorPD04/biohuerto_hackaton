import { createContext, useCallback, useContext, useState } from "react";
import { Button, ConfirmDialog, Modal } from "./primitives.jsx";

const ConfirmContext = createContext(null);

/**
 * Provee confirm() (sí/no, promesa) y notify() (modal informativo) para
 * reutilizar los mismos diálogos en todas las pantallas:
 *   const confirm = useConfirm();  const ok = await confirm(eliminarDialog(nombre));
 *   const notify  = useNotify();   notify(referenciadoDialog());
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // confirmación: { opts, resolve }
  const [info, setInfo] = useState(null); // modal informativo: { title, message }

  const confirm = useCallback(
    (opts) => new Promise((resolve) => setState({ opts, resolve })),
    [],
  );
  const notify = useCallback((opts) => setInfo(opts), []);

  const finish = (value) => {
    setState((s) => {
      s?.resolve(value);
      return null;
    });
  };

  return (
    <ConfirmContext.Provider value={{ confirm, notify }}>
      {children}

      <ConfirmDialog
        open={!!state}
        onClose={() => finish(false)}
        onConfirm={() => finish(true)}
        tone={state?.opts?.tone || "danger"}
        question={state?.opts?.question}
        message={state?.opts?.message}
        confirmLabel={state?.opts?.confirmLabel || "Confirmar"}
      />

      <Modal
        open={!!info}
        onClose={() => setInfo(null)}
        title={info?.title || "Aviso"}
        subtitle={info?.subtitle}
        width={460}
        footer={<Button onClick={() => setInfo(null)}>Entendido</Button>}
      >
        <p className="m-0 text-[15px] leading-[1.6] text-muted-1">{info?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de ConfirmProvider");
  return ctx.confirm;
}

export function useNotify() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useNotify debe usarse dentro de ConfirmProvider");
  return ctx.notify;
}

/* ---- Presets reutilizables (copy + tono idénticos al diseño) ---- */
export const eliminarDialog = (nombre) => ({
  tone: "danger",
  question: `¿Estás seguro que quieres eliminar a ${nombre}?`,
  message: "Esta acción eliminará el registro de forma permanente. No podrás deshacerla.",
  confirmLabel: "Sí, eliminar",
});

export const bajaDialog = (nombre) => ({
  tone: "warning",
  question: `¿Estás seguro que quieres dar de baja a ${nombre}?`,
  message: 'El registro pasará a estado "Baja" y dejará de aparecer como activo. Podrás reactivarlo más tarde.',
  confirmLabel: "Sí, dar de baja",
});

export const reactivarDialog = (nombre) => ({
  tone: "primary",
  question: `¿Reactivar a ${nombre}?`,
  message: "El registro volverá a estado activo y aparecerá de nuevo en los listados.",
  confirmLabel: "Sí, reactivar",
});

/* Modal informativo cuando el borrado es rechazado por integridad referencial. */
export const referenciadoDialog = () => ({
  title: "No se puede eliminar",
  message:
    "Este registro está referenciado en otra tabla, por lo que no puede eliminarse de forma permanente. Puedes darlo de baja en su lugar.",
});
