import Icon from "../ui/Icon.jsx";

const keyOf = (fila, columna) => `${fila}:${columna}`;

export function normalizeCeldas(cultivo) {
  if (Array.isArray(cultivo?.celdas) && cultivo.celdas.length > 0) {
    return cultivo.celdas.map((c) => ({ fila: Number(c.fila), columna: Number(c.columna) }));
  }
  if (cultivo?.celda_fila && cultivo?.celda_columna) {
    return [{ fila: Number(cultivo.celda_fila), columna: Number(cultivo.celda_columna) }];
  }
  return [];
}

export function celdasLabel(celdas) {
  const list = Array.isArray(celdas) ? celdas : [];
  if (list.length === 0) return "Sin celdas";
  if (list.length === 1) return `F${list[0].fila}-C${list[0].columna}`;
  return `${list.length} celdas`;
}

export default function BiohuertoGrid({
  biohuerto,
  cultivos = [],
  selected = [],
  currentCultivoId = null,
  onToggle,
  onOccupiedClick,
  readonly = false,
  compact = false,
}) {
  const filas = Number(biohuerto?.grid_filas) || 4;
  const columnas = Number(biohuerto?.grid_columnas) || 4;
  const selectedKeys = new Set(selected.map((c) => keyOf(Number(c.fila), Number(c.columna))));
  const occupantByCell = new Map();

  cultivos
    .filter((c) => c.is_active !== false)
    .forEach((cultivo) => {
      normalizeCeldas(cultivo).forEach((celda) => {
        occupantByCell.set(keyOf(celda.fila, celda.columna), cultivo);
      });
    });

  const size = compact ? "h-11 w-11" : "h-[54px] w-[54px]";

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white p-4">
      <div
        className="grid w-max gap-3"
        style={{ gridTemplateColumns: `repeat(${columnas}, ${compact ? "44px" : "54px"})` }}
      >
        {Array.from({ length: filas * columnas }, (_, idx) => {
          const fila = Math.floor(idx / columnas) + 1;
          const columna = (idx % columnas) + 1;
          const key = keyOf(fila, columna);
          const occupant = occupantByCell.get(key);
          const occupiedByOther = occupant && String(occupant.id) !== String(currentCultivoId || "");
          const selectedCell = selectedKeys.has(key);
          const number = idx + 1;

          // --- Estilos por estado ---
          let cellClass = "";
          if (selectedCell) {
            // Terracota sólido — "mía"
            cellClass =
              "border-[#874626] bg-[#874626] text-white shadow-[0_3px_0_rgba(135,70,38,.35)] cursor-pointer";
          } else if (occupiedByOther) {
            // Ámbar/naranja — ocupada por otro
            cellClass =
              "border-[#d97706] bg-[#fef3c7] text-[#92400e] cursor-pointer";
          } else {
            // Verde suave — disponible
            cellClass = readonly
              ? "border-[#16a34a] bg-[#f0fdf4] text-[#15803d] cursor-default"
              : "border-[#16a34a] bg-[#f0fdf4] text-[#15803d] hover:bg-[#dcfce7] hover:border-[#15803d] cursor-pointer";
          }

          return (
            <button
              key={key}
              type="button"
              disabled={readonly && !occupiedByOther}
              title={
                occupiedByOther
                  ? `Ocupado: ${occupant.especie || "Cultivo"} (F${fila}-C${columna})`
                  : selectedCell
                    ? `Seleccionado F${fila}-C${columna}`
                    : `Disponible F${fila}-C${columna}`
              }
              onClick={() => {
                if (occupiedByOther) {
                  onOccupiedClick?.(occupant);
                } else if (!readonly) {
                  onToggle?.({ fila, columna });
                }
              }}
              className={`relative grid place-items-center rounded-xl border-2 font-mono text-[12px] font-extrabold transition-all ${size} ${cellClass}`}
            >
              {/* Orejeras estilo bus */}
              <span className="absolute -left-[3px] top-2 h-6 w-[5px] rounded-l-md border border-current bg-inherit" />
              <span className="absolute -right-[3px] top-2 h-6 w-[5px] rounded-r-md border border-current bg-inherit" />

              {selectedCell ? (
                number
              ) : occupiedByOther ? (
                <Icon name="seedling" size={20} stroke={2} />
              ) : (
                <Icon name="plus" size={18} stroke={2.2} />
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-2">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border-2 border-[#16a34a] bg-[#f0fdf4]" />
          Disponible
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border-2 border-[#d97706] bg-[#fef3c7]" />
          Ocupado
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border-2 border-[#874626] bg-[#874626]" />
          Seleccionado
        </span>
      </div>
    </div>
  );
}
