"use client";

import { useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import { useInviteMember, useOrganizationMembers, useRoles } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";

export default function EmployeesPage() {
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
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not invite this person.",
      );
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Employees</h1>
        {!showInvite && (
          <button className="btn-primary" onClick={() => setShowInvite(true)}>
            Invite member
          </button>
        )}
      </div>

      {showInvite && (
        <div className="card space-y-3 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
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
          <p className="text-xs text-slate-400">They must already have an account with this email — invite links come later.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary text-xs" disabled={!email || !roleId || invite.isPending} onClick={onInvite}>
              {invite.isPending ? "Inviting…" : "Send invite"}
            </button>
            <button className="btn-secondary text-xs" onClick={() => setShowInvite(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(members.data ?? []).map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3 font-medium text-slate-900">{m.user.fullName}</td>
                <td className="px-5 py-3 text-slate-500">{m.user.email}</td>
                <td className="px-5 py-3">
                  <span className="badge bg-slate-100 text-slate-600">{m.role.name}</span>
                </td>
                <td className="px-5 py-3 text-slate-500">{m.status}</td>
                <td className="px-5 py-3 text-slate-400">{formatDateTime(m.joinedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
