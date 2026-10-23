import Link from "next/link";

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "default" | "warning";
}) {
  const body = (
    <>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && (
        <p className={`mt-1 text-xs ${tone === "warning" ? "font-medium text-amber-600" : "text-slate-400"}`}>{hint}</p>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card block p-5 transition-colors hover:border-brand-500/40 hover:bg-slate-50">
        {body}
      </Link>
    );
  }
  return <div className="card p-5">{body}</div>;
}
