export default function PageHeader({ title, eyebrow, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wide text-leaf-800">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

