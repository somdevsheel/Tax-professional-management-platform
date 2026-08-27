"use client";

import { StatCard } from "@/components/stat-card";
import { useReportsSummary } from "@/lib/hooks";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Breakdown({ title, counts, total }: { title: string; counts: Record<string, number>; total: number }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {entries.length === 0 && <p className="text-sm text-slate-400">Nothing yet.</p>}
      <div className="space-y-2">
        {entries.map(([label, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={label}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{label.replace(/_/g, " ")}</span>
                <span className="text-slate-500">{count}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const summary = useReportsSummary();

  if (summary.isLoading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (!summary.data) return null;

  const { clients, tasks, compliance, documents } = summary.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">A snapshot across every client, task, and filing in your firm.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clients" value={clients.total} />
        <StatCard label="Overdue tasks" value={tasks.overdueCount} hint={`of ${tasks.total} total`} />
        <StatCard
          label="Overdue filings"
          value={compliance.overdueCount}
          hint={`${compliance.dueNext30DaysCount} due in the next 30 days`}
        />
        <StatCard label="Documents stored" value={documents.total} hint={formatSize(documents.totalSizeBytes)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Breakdown title="Clients by status" counts={clients.byStatus} total={clients.total} />
        <Breakdown title="Tasks by status" counts={tasks.byStatus} total={tasks.total} />
        <Breakdown title="Tasks by priority" counts={tasks.byPriority} total={tasks.total} />
        <Breakdown title="Compliance filings by status" counts={compliance.byStatus} total={compliance.total} />
      </div>
    </div>
  );
}
