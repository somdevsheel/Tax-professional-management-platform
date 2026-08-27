import { useReportsSummary } from "../lib/hooks";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Breakdown({ title, counts, total }: { title: string; counts: Record<string, number>; total: number }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="card">
      <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>{title}</h3>
      {entries.length === 0 && <p className="muted">Nothing yet.</p>}
      {entries.map(([label, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={label} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span>{label.replace(/_/g, " ")}</span>
              <span className="muted">{count}</span>
            </div>
            <div style={{ marginTop: 4, height: 6, borderRadius: 3, background: "#f1f5f9" }}>
              <div style={{ width: `${pct}%`, height: 6, borderRadius: 3, background: "#1d4ed8" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ReportsPage() {
  const summary = useReportsSummary();

  if (summary.isLoading) return <p className="muted">Loading…</p>;
  if (!summary.data) return null;

  const { clients, tasks, compliance, documents } = summary.data;

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Reports</h2>
      <p className="muted" style={{ marginBottom: 20 }}>A snapshot across every client, task, and filing in your firm.</p>

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat-card">
          <p className="label">Clients</p>
          <p className="value">{clients.total}</p>
        </div>
        <div className="stat-card">
          <p className="label">Overdue tasks</p>
          <p className="value">{tasks.overdueCount}</p>
          <p className="muted" style={{ margin: "4px 0 0" }}>of {tasks.total} total</p>
        </div>
        <div className="stat-card">
          <p className="label">Overdue filings</p>
          <p className="value">{compliance.overdueCount}</p>
          <p className="muted" style={{ margin: "4px 0 0" }}>{compliance.dueNext30DaysCount} due in 30 days</p>
        </div>
        <div className="stat-card">
          <p className="label">Documents stored</p>
          <p className="value">{documents.total}</p>
          <p className="muted" style={{ margin: "4px 0 0" }}>{formatSize(documents.totalSizeBytes)}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
        <Breakdown title="Clients by status" counts={clients.byStatus} total={clients.total} />
        <Breakdown title="Tasks by status" counts={tasks.byStatus} total={tasks.total} />
        <Breakdown title="Tasks by priority" counts={tasks.byPriority} total={tasks.total} />
        <Breakdown title="Compliance filings by status" counts={compliance.byStatus} total={compliance.total} />
      </div>
    </div>
  );
}
