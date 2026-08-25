"use client";

import Link from "next/link";
import { useAuditLog, useClients, useOrganizationMembers } from "@/lib/hooks";
import { StatCard } from "@/components/stat-card";
import { formatRelative, humanizeAction } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();
  const clients = useClients({});
  const members = useOrganizationMembers();
  const activity = useAuditLog();

  const recentClients = [...(clients.data?.data ?? [])]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Welcome back, {user?.fullName?.split(" ")[0]}</h1>
        <p className="text-sm text-slate-500">Here&apos;s what&apos;s happening across your firm.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total clients" value={clients.data?.meta?.total ?? "—"} />
        <StatCard label="Team members" value={members.data?.length ?? "—"} />
        <StatCard label="Recent activity" value={activity.data?.data.length ?? "—"} hint="last 50 events" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Recent clients</h2>
            <Link href="/clients" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {recentClients.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-slate-400">No clients yet.</li>
            )}
            {recentClients.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.entityType.replace(/_/g, " ")}</p>
                  </div>
                  <span className="badge bg-slate-100 text-slate-600">{c.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
            <Link href="/activity" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {(activity.data?.data ?? []).length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-slate-400">No activity yet.</li>
            )}
            {(activity.data?.data ?? []).slice(0, 8).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-slate-700">{humanizeAction(entry.action)}</span>
                <span className="text-xs text-slate-400">{formatRelative(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
