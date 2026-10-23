import { Link } from "react-router-dom";
import { useAuditLog, useClients, useOrganizationMembers, useReportsSummary } from "../lib/hooks";
import { useAuth } from "../lib/auth-context";
import { formatDateTime } from "../lib/format";

function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function DashboardPage() {
  const { user } = useAuth();
  const clients = useClients({});
  const members = useOrganizationMembers();
  const activity = useAuditLog();
  // Requires reports.view — roles without it just don't get the task/filing tiles.
  const summary = useReportsSummary();
  const tasks = summary.data?.tasks;
  const compliance = summary.data?.compliance;
  const openTasks = tasks
    ? tasks.total - (tasks.byStatus.COMPLETED ?? 0) - (tasks.byStatus.CANCELLED ?? 0)
    : undefined;

  const recentClients = [...(clients.data?.data ?? [])]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  return (
    <div>
      <h2 style={{ marginBottom: 2, fontSize: 18 }}>Welcome back, {user?.fullName?.split(" ")[0]}</h2>
      <p className="muted" style={{ marginBottom: 16 }}>
        Here&apos;s what&apos;s happening across your firm.
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <p className="label">Total clients</p>
          <p className="value">{clients.data?.meta?.total ?? "—"}</p>
        </div>
        <div className="stat-card">
          <p className="label">Team members</p>
          <p className="value">{members.data?.length ?? "—"}</p>
        </div>
        {tasks && compliance ? (
          <>
            <Link to="/tasks" className="stat-card stat-card-link">
              <p className="label">Open tasks</p>
              <p className="value">{openTasks ?? "—"}</p>
              <p className={`hint${tasks.overdueCount > 0 ? " warning" : ""}`}>
                {tasks.overdueCount > 0 ? `${tasks.overdueCount} overdue` : "none overdue"}
              </p>
            </Link>
            <Link to="/compliance" className="stat-card stat-card-link">
              <p className="label">Filings due in 30 days</p>
              <p className="value">{compliance.dueNext30DaysCount}</p>
              <p className={`hint${compliance.overdueCount > 0 ? " warning" : ""}`}>
                {compliance.overdueCount > 0 ? `${compliance.overdueCount} overdue` : "none overdue"}
              </p>
            </Link>
          </>
        ) : (
          <div className="stat-card">
            <p className="label">Recent activity</p>
            <p className="value">{activity.data?.data.length ?? "—"}</p>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
            <strong style={{ fontSize: 13 }}>Recent clients</strong>
            <Link to="/clients" style={{ fontSize: 12 }}>
              View all
            </Link>
          </div>
          {recentClients.length === 0 && (
            <p className="muted" style={{ padding: 14 }}>No clients yet.</p>
          )}
          {recentClients.map((c) => (
            <Link key={c.id} to={`/clients/${c.id}`} className="list-row" style={{ padding: "8px 14px" }}>
              <span>{c.name}</span>
              <span className="badge">{c.status}</span>
            </Link>
          ))}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
            <strong style={{ fontSize: 13 }}>Recent activity</strong>
            <Link to="/activity" style={{ fontSize: 12 }}>
              View all
            </Link>
          </div>
          {(activity.data?.data ?? []).length === 0 && (
            <p className="muted" style={{ padding: 14 }}>No activity yet.</p>
          )}
          {(activity.data?.data ?? []).slice(0, 8).map((entry) => (
            <div key={entry.id} className="list-row" style={{ padding: "8px 14px" }}>
              <span>{humanizeAction(entry.action)}</span>
              <span className="muted">{formatDateTime(entry.createdAt)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
