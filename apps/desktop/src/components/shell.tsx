import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/clients", label: "Clients" },
  { to: "/portals", label: "Portals" },
  { to: "/tasks", label: "Tasks", pending: true },
  { to: "/compliance", label: "Compliance", pending: true },
  { to: "/documents", label: "Documents", pending: true },
  { to: "/employees", label: "Employees" },
  { to: "/reports", label: "Reports", pending: true },
  { to: "/activity", label: "Activity" },
  { to: "/settings", label: "Settings" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, memberships, organizationId, logout, switchOrganization } = useAuth();
  const activeOrg = memberships.find((m) => m.organizationId === organizationId);
  const [switching, setSwitching] = useState(false);

  async function onSwitch(orgId: string) {
    setSwitching(true);
    try {
      await switchOrganization(orgId);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" style={{ display: "flex", flexDirection: "column" }}>
        <h1>Tax Practice Platform</h1>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? "active" : "")}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span>{item.label}</span>
            {item.pending && (
              <span className="badge" style={{ fontSize: 9, background: "#f1f5f9", color: "#94a3b8" }}>
                soon
              </span>
            )}
          </NavLink>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 24 }}>
          {memberships.length > 1 ? (
            <select
              className="input"
              style={{ margin: "0 8px", width: "calc(100% - 16px)" }}
              value={organizationId ?? ""}
              disabled={switching}
              onChange={(e) => onSwitch(e.target.value)}
            >
              {!organizationId && <option value="">Select a firm…</option>}
              {memberships.map((m) => (
                <option key={m.organizationId} value={m.organizationId}>
                  {m.organizationName}
                </option>
              ))}
            </select>
          ) : (
            <p className="muted" style={{ padding: "0 8px" }}>
              {activeOrg?.organizationName}
            </p>
          )}
          <p className="muted" style={{ padding: "0 8px" }}>
            {user?.fullName}
          </p>
          <button className="btn btn-secondary" style={{ margin: "8px", width: "calc(100% - 16px)" }} onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
