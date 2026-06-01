export default function EmptyState({ title, detail }) {
  return (
    <div className="panel flex min-h-36 flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {detail && <p className="mt-1 max-w-sm text-sm text-slate-500">{detail}</p>}
    </div>
  );
}

