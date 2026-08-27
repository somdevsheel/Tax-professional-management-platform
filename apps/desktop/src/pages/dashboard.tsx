import { Link } from "react-router-dom";
import { useAuditLog, useClients, useOrganizationMembers } from "../lib/hooks";
import { useAuth } from "../lib/auth-context";

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
        <div className="stat-card">
          <p className="label">Recent activity</p>
          <p className="value">{activity.data?.data.length ?? "—"}</p>
        </div>
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
              <span className="muted">{new Date(entry.createdAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
