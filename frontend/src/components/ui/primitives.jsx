import { useRef, useState } from "react";
import Icon from "./Icon.jsx";
import {
  ETAPAS,
  PRIORIDAD,
  ESTADO_ALERTA,
  ESTADO_COSECHA,
  ESTADO_INCIDENCIA,
  SEVERIDAD_INCIDENCIA,
  tintGradient,
} from "../../lib/theme.js";

export { default as Icon } from "./Icon.jsx";

/* ---------------- Badge ---------------- */
export function Badge({ children, bg, fg, dot, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-[6px] whitespace-nowrap rounded-full px-[11px] py-1 text-[12.5px] font-bold ${className}`}
      style={{ background: bg, color: fg }}
    >
      {dot && <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

export function EtapaBadge({ etapa, className }) {
  const e = ETAPAS[etapa] || ETAPAS.semillero;
  return <Badge bg={e.bg} fg={e.fg} dot={e.dot} className={className}>{e.label}</Badge>;
}

// Badge genérico a partir de un mapa (prioridad/estado).
function mapBadge(map, key, fallbackLabel) {
  const m = map[key] || { bg: "#eef2ec", fg: "#6e786f", dot: "#9aa39a", label: fallbackLabel || key };
  return <Badge bg={m.bg} fg={m.fg} dot={m.dot}>{m.label}</Badge>;
}
export const PrioridadBadge = ({ prioridad }) => mapBadge(PRIORIDAD, prioridad);
export const EstadoAlertaBadge = ({ estado }) => mapBadge(ESTADO_ALERTA, estado);
export const EstadoCosechaBadge = ({ estado }) => mapBadge(ESTADO_COSECHA, estado);
export const EstadoIncidenciaBadge = ({ estado }) => mapBadge(ESTADO_INCIDENCIA, estado);
export const SeveridadBadge = ({ severidad }) => mapBadge(SEVERIDAD_INCIDENCIA, severidad);

export function EstadoBadge({ activo }) {
  return activo ? (
    <Badge bg="#dcefd7" fg="#2f6b34" dot="#5aa860">Activo</Badge>
  ) : (
    <Badge bg="#fbe1de" fg="#b23a2e">Baja</Badge>
  );
}

/* ---------------- Button ---------------- */
const BTN_VARIANTS = {
  primary: "bg-primary text-white border-transparent",
  secondary: "bg-white text-primary border-line",
  ghost: "bg-chip text-text border-transparent",
  outline: "bg-white text-primary border-primary",
  danger: "bg-white text-[#b23a2e] border-[#f1d3cf]",
  muted: "bg-chip text-muted-2 border-transparent",
  success: "bg-accent-700 text-white border-transparent",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  onClick,
  type = "button",
  full,
  title,
  disabled,
  className = "",
}) {
  const sz = size === "sm" ? "text-[13.5px] px-[14px] py-2" : "text-[15px] px-5 py-3";
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-[9px] whitespace-nowrap rounded-xl border font-bold transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${sz} ${BTN_VARIANTS[variant]} ${full ? "w-full" : ""} ${className}`}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} stroke={2.1} />}
      {children}
    </button>
  );
}

/* ---------------- Icon button (acciones de tabla) ---------------- */
const TONES = { default: "text-muted-2", danger: "text-[#b23a2e]", primary: "text-primary" };
export function IconBtn({ name, title, tone = "default", onClick }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-[9px] border-none bg-transparent transition-colors hover:bg-chip ${TONES[tone]}`}
    >
      <Icon name={name} size={18} />
    </button>
  );
}

/* ---------------- Card ---------------- */
export function Card({ children, className = "", pad = "", onClick, hover }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[18px] border border-line bg-surface shadow-card transition-all ${
        hover ? "hover:-translate-y-[3px] hover:shadow-cardHover" : ""
      } ${onClick ? "cursor-pointer" : ""} ${pad} ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------- Form controls ---------------- */
export function Field({ label, children, hint, className = "" }) {
  return (
    <label className={`flex flex-col gap-[7px] ${className}`}>
      {label && <span className="text-[13.5px] font-bold text-text">{label}</span>}
      {children}
      {hint && <span className="text-xs text-muted-2">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-white px-[14px] py-3 text-[15px] text-text outline-none transition-all focus:border-primary focus:shadow-[0_0_0_3px_rgba(31,90,53,.12)]";

export function Input(props) {
  return <input {...props} className={`${inputCls} ${props.className || ""}`} />;
}
export function Textarea(props) {
  return <textarea {...props} className={`${inputCls} min-h-[92px] resize-y ${props.className || ""}`} />;
}
export function Select({ children, className = "", ...props }) {
  return (
    <div className="relative">
      <select {...props} className={`${inputCls} cursor-pointer appearance-none pr-10 ${className}`}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-[13px] top-1/2 -translate-y-1/2 text-muted-2">
        <Icon name="chevDown" size={18} />
      </span>
    </div>
  );
}

export function SearchInput({ placeholder, value, onChange, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-[15px] top-1/2 -translate-y-1/2 text-muted-2">
        <Icon name="search" size={18} />
      </span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`${inputCls} pl-11`}
      />
    </div>
  );
}

export function Toggle({ on, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-[26px] w-[46px] flex-shrink-0 rounded-full border-none p-[3px] transition-colors ${
        on ? "justify-end" : "justify-start bg-[#d4d8d2]"
      }`}
      style={on ? { background: "linear-gradient(180deg, #4cd964 0%, #34c14a 100%)" } : undefined}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-all" />
    </button>
  );
}

/* ---------------- Image upload ---------------- */
export function ImageUpload({
  defaultUrl = "",
  height = 180,
  label = "Arrastra una imagen o haz clic para subirla",
  hint = "PNG o JPG · hasta 5 MB",
  onChange,
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const apply = (v) => {
    setUrl(v);
    onChange && onChange(v);
  };
  const read = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = () => apply(r.result);
    r.readAsDataURL(file);
  };
  const chip =
    "rounded-[9px] border-none bg-white/90 px-[13px] py-[7px] text-[13px] font-bold text-text shadow-[0_2px_8px_rgba(20,40,30,.18)] cursor-pointer";
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          read(e.target.files[0]);
          // Limpia el value para poder volver a elegir el mismo archivo después de "Quitar".
          e.target.value = "";
        }}
        className="hidden"
      />
      {url ? (
        <div className="relative overflow-hidden rounded-[14px]" style={{ height }}>
          <img src={url} alt="" className="block h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-end justify-end gap-2 bg-gradient-to-t from-black/30 to-transparent p-3">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                inputRef.current.click();
              }}
              className={chip}
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                apply("");
              }}
              className={`${chip} !text-[#b23a2e]`}
            >
              Quitar
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={(e) => {
            e.preventDefault();
            inputRef.current.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            read(e.dataTransfer.files[0]);
          }}
          className={`cursor-pointer rounded-[14px] border-2 border-dashed px-6 py-[26px] text-center transition-all ${
            over ? "border-primary bg-accent-50" : "border-line-2 bg-transparent"
          }`}
        >
          <span className="mx-auto mb-3 grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-accent-50 text-primary">
            <Icon name="upload" size={24} />
          </span>
          <div className="text-[14.5px] font-bold text-text">{label}</div>
          <div className="mt-1 text-[12.5px] text-muted-2">{hint}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, subtitle, children, footer, width = 560 }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(18,30,22,.46)] p-6 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-[94vw] flex-col overflow-hidden rounded-[20px] bg-bg shadow-modal animate-popIn"
        style={{ width: `min(${width}px, 94vw)` }}
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-line bg-white px-[26px] py-[22px]">
          <div>
            <h3 className="m-0 text-[21px] font-extrabold text-text">{title}</h3>
            {subtitle && <p className="mt-[5px] text-sm text-muted-2">{subtitle}</p>}
          </div>
          <IconBtn name="x" title="Cerrar" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto p-[26px]">{children}</div>
        {footer && (
          <div className="flex flex-shrink-0 justify-end gap-3 border-t border-line bg-white px-[26px] py-[18px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Confirm dialog ---------------- */
const CONFIRM_TONES = {
  danger: "#b23a2e",
  warning: "#9a5a23",
  primary: "var(--primary)",
};
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  tone = "danger",
  question,
  message,
  confirmLabel = "Confirmar",
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] grid place-items-center bg-[rgba(18,30,22,.46)] p-5 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[476px] max-w-[94vw] overflow-hidden rounded-[18px] bg-white shadow-modal animate-popIn"
      >
        <div className="px-7 pb-[22px] pt-7">
          <p className="m-0 text-[19px] font-extrabold leading-[1.35] text-text">{question}</p>
          {message && <p className="mt-[10px] text-sm leading-[1.55] text-muted-2">{message}</p>}
        </div>
        <div className="flex justify-end gap-3 px-7 pb-[22px] pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <button
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-[9px] whitespace-nowrap rounded-xl border-none px-[22px] py-3 text-[15px] font-bold text-white transition-all hover:brightness-90"
            style={{ background: CONFIRM_TONES[tone] || CONFIRM_TONES.danger }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({ icon = "leaf", title, desc, action }) {
  return (
    <div className="rounded-[18px] border-[1.5px] border-dashed border-line-2 bg-white/50 px-6 py-12 text-center text-muted-2">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-chip text-muted-2">
        <Icon name={icon} size={26} />
      </div>
      <h4 className="m-0 text-lg font-extrabold text-text">{title}</h4>
      {desc && <p className="mx-auto mt-2 max-w-[380px] text-[14.5px] leading-[1.5]">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------- Page header ---------------- */
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-[26px] flex flex-wrap items-start justify-between gap-5">
      <div>
        <h1 className="m-0 text-[34px] font-extrabold tracking-[-.02em] text-primary">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-muted-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name = "", size = 44, tint = "default", dim }) {
  const initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div
      className="grid flex-shrink-0 place-items-center rounded-full font-extrabold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: tintGradient(tint),
        opacity: dim ? 0.5 : 1,
        filter: dim ? "grayscale(.5)" : "none",
      }}
    >
      {initials}
    </div>
  );
}

/* ---------------- Tabs (pill) ---------------- */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="mb-[22px] inline-flex gap-1 rounded-[14px] bg-chip p-[5px]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`inline-flex items-center gap-2 rounded-[10px] px-[18px] py-[9px] text-[14.5px] font-bold transition-all ${
            active === t.id
              ? "bg-white text-primary shadow-[0_1px_3px_rgba(20,40,30,.12)]"
              : "bg-transparent text-muted-2"
          }`}
        >
          {t.icon && <Icon name={t.icon} size={17} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Photo placeholder ---------------- */
export function Photo({ tint, label, height = 150, radius = 0, badge, src, className = "" }) {
  return (
    <div
      className={`relative flex items-end overflow-hidden ${className}`}
      style={{ height, borderRadius: radius, background: tintGradient(tint) }}
    >
      {src ? (
        // Imagen real subida por el usuario; si falla la carga, se quita y queda el degradado.
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <>
          <div
            className="absolute inset-0 opacity-[.16]"
            style={{ backgroundImage: "repeating-linear-gradient(135deg, #fff 0 2px, transparent 2px 11px)" }}
          />
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,.28), transparent 60%)" }}
          />
          {label && (
            <span className="relative m-[10px] rounded-md bg-black/20 px-2 py-[3px] font-mono text-[11px] text-white/90">
              {label}
            </span>
          )}
        </>
      )}
      {badge}
    </div>
  );
}
