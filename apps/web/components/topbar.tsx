"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { MenuIcon } from "./icons";

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
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
    <header className="flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenNav}
          className="-ml-1.5 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
          aria-label="Open navigation"
          aria-controls="app-sidebar"
        >
          <MenuIcon />
        </button>
        {memberships.length > 1 ? (
          <select
            className="min-w-0 max-w-[12rem] rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-medium text-slate-700 sm:max-w-none"
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
          <span className="truncate text-sm font-medium text-slate-700">{activeMembership?.organizationName}</span>
        )}
        {activeMembership && (
          <span className="badge hidden bg-slate-100 text-slate-500 sm:inline-flex">{activeMembership.role}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span className="hidden text-sm text-slate-500 sm:inline">{user?.fullName}</span>
        <button onClick={onLogout} className="btn-secondary text-xs">
          Sign out
        </button>
      </div>
    </header>
  );
}
