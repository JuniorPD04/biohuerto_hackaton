// ====== Tokens de dominio (etapas, tints) y helpers de formato ======

export const ETAPAS = {
  semillero: { label: "Semillero", bg: "#e7e9e6", fg: "#5a625a", dot: "#9aa39a" },
  crecimiento: { label: "Crecimiento", bg: "#dcefd7", fg: "#2f6b34", dot: "#5aa860" },
  floracion: { label: "Floración", bg: "#fbf0c9", fg: "#8a6b16", dot: "#e2b53a" },
  fructificacion: { label: "Fructificación", bg: "#fbe2cd", fg: "#9a5a23", dot: "#e0863f" },
  cosecha: { label: "Cosecha", bg: "#cfe8cd", fg: "#1f5a2d", dot: "#2f8a3e" },
  finalizado: { label: "Finalizado", bg: "#dadcd8", fg: "#4a4f49", dot: "#6e756d" },
};

export const ETAPA_ORDER = [
  "semillero",
  "crecimiento",
  "floracion",
  "fructificacion",
  "cosecha",
  "finalizado",
];

export const TINTS = {
  tomate: ["#c75b46", "#e08a5b"],
  lechuga: ["#5a9a4e", "#a7c957"],
  albahaca: ["#4f8a44", "#86b85a"],
  zanahoria: ["#cf7a3a", "#e6a857"],
  pimiento: ["#3f7a3a", "#7ab04e"],
  espinaca: ["#3c6e3a", "#6f9a52"],
  default: ["#4a7a4a", "#86ab63"],
};

// Deriva un tint estable a partir del nombre de la especie/producto.
export function tintFor(nombre = "") {
  const key = nombre.toLowerCase();
  for (const k of Object.keys(TINTS)) {
    if (k !== "default" && key.includes(k)) return k;
  }
  return "default";
}

export function tintGradient(key) {
  const [a, b] = TINTS[key] || TINTS.default;
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function fmtFecha(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split(" ")[0].split("-");
  return `${d}/${m}/${y}`;
}

export function fmtMoneda(monto, moneda = "PEN") {
  if (monto == null) return "—";
  const n = Number(monto);
  const sign = moneda === "PEN" ? "S/ " : "";
  return `${sign}${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Estado de alerta / cosecha / usuario → estilos de badge
export const PRIORIDAD = {
  alta: { bg: "#fbe1de", fg: "#b23a2e", dot: "#d6584a", label: "Alta" },
  media: { bg: "#fbe2cd", fg: "#9a5a23", dot: "#e0863f", label: "Media" },
  baja: { bg: "#eef2ec", fg: "#6e786f", dot: "#9aa39a", label: "Baja" },
};

export const ESTADO_ALERTA = {
  pendiente: { bg: "#fbf0c9", fg: "#8a6b16", dot: "#e2b53a", label: "Pendiente" },
  completada: { bg: "#dcefd7", fg: "#2f6b34", dot: "#5aa860", label: "Completada" },
  descartada: { bg: "#e7e9e6", fg: "#5a625a", dot: "#9aa39a", label: "Descartada" },
};

export const SEVERIDAD_INCIDENCIA = {
  alta: { bg: "#fbe1de", fg: "#b23a2e", dot: "#d6584a", label: "Alta" },
  media: { bg: "#fbe2cd", fg: "#9a5a23", dot: "#e0863f", label: "Media" },
  baja: { bg: "#eef2ec", fg: "#6e786f", dot: "#9aa39a", label: "Baja" },
};

export const ESTADO_INCIDENCIA = {
  abierta: { bg: "#fbe1de", fg: "#b23a2e", dot: "#d6584a", label: "Abierta" },
  en_revision: { bg: "#fbf0c9", fg: "#8a6b16", dot: "#e2b53a", label: "En revisión" },
  cerrada: { bg: "#dcefd7", fg: "#2f6b34", dot: "#5aa860", label: "Cerrada" },
};

export const ESTADO_COSECHA = {
  disponible: { bg: "#dcefd7", fg: "#2f6b34", dot: "#5aa860", label: "Disponible" },
  publicado: { bg: "#d6e8f0", fg: "#1f5a7a", dot: "#3f8ab0", label: "Publicado" },
  agotado: { bg: "#fbe2cd", fg: "#9a5a23", dot: "#e0863f", label: "Agotado" },
  baja: { bg: "#fbe1de", fg: "#b23a2e", dot: "#d6584a", label: "Baja" },
};
