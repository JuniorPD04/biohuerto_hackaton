export function money(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 2,
  }).format(number);
}

export function number(value, options = {}) {
  return new Intl.NumberFormat("es-PE", options).format(Number(value || 0));
}

export function dateText(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(value)
  );
}

export function priorityLabel(value) {
  return { 1: "Alta", 2: "Media", 3: "Baja" }[value] || "Media";
}

export function stageLabel(value) {
  return {
    semillero: "Semillero",
    crecimiento: "Crecimiento",
    floracion: "Floracion",
    fructificacion: "Fructificacion",
    cosecha: "Cosecha",
    finalizado: "Finalizado",
  }[value] || value;
}

