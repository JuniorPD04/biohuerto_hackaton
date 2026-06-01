export default function StatusBadge({ children, tone = "leaf" }) {
  const classes =
    tone === "red"
      ? "bg-red-50 text-red-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : tone === "slate"
          ? "bg-slate-100 text-slate-700"
          : "bg-leaf-50 text-leaf-800";
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}

