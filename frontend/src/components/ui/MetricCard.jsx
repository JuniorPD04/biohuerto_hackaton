export default function MetricCard({ label, value, detail, tone = "leaf", icon: Icon }) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "slate"
        ? "bg-slate-100 text-slate-700"
        : "bg-leaf-50 text-leaf-800";

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        {Icon && (
          <div className={`flex h-10 w-10 items-center justify-center rounded-md ${toneClass}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      {detail && <p className="mt-2 text-sm text-slate-500">{detail}</p>}
    </div>
  );
}

