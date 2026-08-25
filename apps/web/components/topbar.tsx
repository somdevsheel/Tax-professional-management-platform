"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function Topbar() {
  const { user, organizationId, memberships, logout, switchOrganization } = useAuth();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  const activeMembership = memberships.find((m) => m.organizationId === organizationId);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  async function onSwitch(orgId: string) {
    setSwitching(true);
    try {
      await switchOrganization(orgId);
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-3">
        {memberships.length > 1 ? (
          <select
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-medium text-slate-700"
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
          <span className="text-sm font-medium text-slate-700">{activeMembership?.organizationName}</span>
        )}
        {activeMembership && (
          <span className="badge bg-slate-100 text-slate-500">{activeMembership.role}</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-500">{user?.fullName}</span>
        <button onClick={onLogout} className="btn-secondary text-xs">
          Sign out
        </button>
      </div>
    </header>
  );
}
