import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function Shell({ children }: { children: ReactNode }) {
  const { user, memberships, organizationId, logout } = useAuth();
  const activeOrg = memberships.find((m) => m.organizationId === organizationId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Tax Practice Platform</h1>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Clients
        </NavLink>
        <div style={{ marginTop: "auto", paddingTop: 24 }}>
          <p className="muted" style={{ padding: "0 8px" }}>
            {activeOrg?.organizationName}
          </p>
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
