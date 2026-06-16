import { Card, EmptyState } from "./primitives.jsx";

/**
 * Tabla de gestión reutilizable, con el mismo look & feel que la vista lista de
 * Biohuertos (Card + cabecera gris + filas con borde inferior).
 *
 * Props:
 *  - columns: [{ key, label, render?(row)->JSX, width?:string, align?:"left"|"right" }]
 *  - rows:    array de objetos a mostrar.
 *  - loading: boolean; muestra un EmptyState de carga.
 *  - empty:   { icon?, title?, desc?, action? } para el estado vacío.
 *  - rowActions(row) -> JSX: celda de acciones alineada a la derecha.
 *  - rowKey:  (row, i) => key. Por defecto usa row.id o el índice.
 */
export default function DataTable({
  columns = [],
  rows = [],
  loading = false,
  empty = {},
  rowActions,
  rowKey,
}) {
  // Plantilla de columnas: usa el width declarado o 1fr; reserva una columna
  // extra para las acciones cuando se provee rowActions.
  const template = [
    ...columns.map((c) => c.width || "1fr"),
    ...(rowActions ? ["minmax(120px, .9fr)"] : []),
  ].join(" ");

  if (loading) {
    return (
      <EmptyState
        icon={empty.icon || "sprout"}
        title="Cargando…"
        desc="Un momento por favor."
      />
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={empty.icon || "list"}
        title={empty.title || "Sin registros"}
        desc={empty.desc || "Aún no hay datos para mostrar."}
        action={empty.action}
      />
    );
  }

  const keyFor = (row, i) => (rowKey ? rowKey(row, i) : row.id ?? i);

  return (
    <Card pad="" className="overflow-hidden">
      <div
        className="grid items-center gap-3 border-b border-line bg-chip-2 px-[22px] py-[14px] text-[12.5px] font-extrabold uppercase tracking-[.05em] text-muted-2"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((c) => (
          <div key={c.key} className={c.align === "right" ? "text-right" : ""}>
            {c.label}
          </div>
        ))}
        {rowActions && <div className="text-right">Acciones</div>}
      </div>

      {rows.map((row, i) => (
        <div
          key={keyFor(row, i)}
          className="grid items-center gap-3 border-b border-line px-[22px] py-[15px] last:border-b-0"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((c) => (
            <div
              key={c.key}
              className={`min-w-0 text-[14.5px] text-text ${
                c.align === "right" ? "text-right" : ""
              }`}
            >
              {c.render ? (
                c.render(row)
              ) : (
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                  {row[c.key] ?? "—"}
                </span>
              )}
            </div>
          ))}
          {rowActions && (
            <div className="flex items-center justify-end gap-[6px]">
              {rowActions(row)}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
