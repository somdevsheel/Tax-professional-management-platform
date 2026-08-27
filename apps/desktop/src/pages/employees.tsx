import { useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import { useInviteMember, useOrganizationMembers, useRoles } from "../lib/hooks";
import { formatDateTime } from "../lib/format";

export function EmployeesPage() {
  const members = useOrganizationMembers();
  const roles = useRoles();
  const invite = useInviteMember();

  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onInvite() {
    setError(null);
    try {
      await invite.mutateAsync({ email, roleId });
      setEmail("");
      setRoleId("");
      setShowInvite(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not invite this person.");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: 18 }}>Employees</h2>
        {!showInvite && (
          <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
            Invite member
          </button>
        )}
      </div>

      {showInvite && (
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 8 }}>
            <input
              type="email"
              className="input"
              placeholder="Email of an existing account"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Select role…</option>
              {(roles.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <p className="muted">They must already have an account with this email.</p>
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" disabled={!email || !roleId || invite.isPending} onClick={onInvite}>
              {invite.isPending ? "Inviting…" : "Send invite"}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowInvite(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {(members.data ?? []).map((m) => (
              <tr key={m.id}>
                <td>{m.user.fullName}</td>
                <td className="muted">{m.user.email}</td>
                <td>
                  <span className="badge">{m.role.name}</span>
                </td>
                <td className="muted">{m.status}</td>
                <td className="muted">{formatDateTime(m.joinedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
