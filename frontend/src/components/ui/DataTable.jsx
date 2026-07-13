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
        className="hidden items-center gap-3 border-b border-line bg-chip-2 px-[22px] py-[14px] text-[12.5px] font-extrabold uppercase tracking-[.05em] text-muted-2 md:grid md:[grid-template-columns:var(--table-cols)]"
        style={{ "--table-cols": template }}
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
          className="grid grid-cols-1 gap-3 border-b border-line px-4 py-4 last:border-b-0 md:items-center md:px-[22px] md:py-[15px] md:[grid-template-columns:var(--table-cols)]"
          style={{ "--table-cols": template }}
        >
          {columns.map((c) => (
            <div
              key={c.key}
              className={`grid min-w-0 grid-cols-[minmax(92px,.8fr)_1.4fr] items-start gap-3 text-[14.5px] text-text md:block ${
                c.align === "right" ? "text-right" : ""
              }`}
            >
              <span className="text-left text-xs font-extrabold uppercase tracking-[.04em] text-muted-2 md:hidden">{c.label}</span>
              {c.render ? (
                <span className="min-w-0 text-left md:contents">{c.render(row)}</span>
              ) : (
                <span className="block overflow-hidden text-ellipsis text-left md:whitespace-nowrap">
                  {row[c.key] ?? "—"}
                </span>
              )}
            </div>
          ))}
          {rowActions && (
            <div className="flex items-center justify-end gap-[6px] border-t border-line pt-3 md:border-0 md:pt-0">
              {rowActions(row)}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
