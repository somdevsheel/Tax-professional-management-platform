export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
      <p className="mt-4 text-xs text-slate-400">
        The database schema is already in place — this module lands in the next build phase.
      </p>
    </div>
  );
}
