"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { CLIENT_STATUSES } from "@tax-platform/types";
import { useClient, usePortalAccounts, useUpdateClient } from "@/lib/hooks";
import { PortalAccountCard } from "@/components/portal-account-card";
import { AddPortalAccountForm } from "@/components/add-portal-account-form";

const INFO_FIELDS: Array<{ key: "pan" | "gstin" | "tan" | "cin" | "email" | "phone"; label: string }> = [
  { key: "pan", label: "PAN" },
  { key: "gstin", label: "GSTIN" },
  { key: "tan", label: "TAN" },
  { key: "cin", label: "CIN" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700",
  ONBOARDING: "bg-blue-50 text-blue-700",
  INACTIVE: "bg-slate-100 text-slate-500",
  OFFBOARDED: "bg-red-50 text-red-700",
};

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientQuery = useClient(params.id);
  const portalAccounts = usePortalAccounts(params.id);
  const updateClient = useUpdateClient(params.id);
  const [showAddPortal, setShowAddPortal] = useState(false);

  const client = clientQuery.data;

  if (clientQuery.isLoading) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }
  if (!client) {
    return <p className="text-sm text-red-600">Client not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{client.name}</h1>
            <p className="text-sm text-slate-500">{client.entityType.replace(/_/g, " ")}</p>
          </div>
          <select
            className={`badge border-0 text-xs ${STATUS_BADGE[client.status]}`}
            value={client.status}
            onChange={(e) => updateClient.mutate({ status: e.target.value })}
          >
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {INFO_FIELDS.map((f) => (
            <div key={f.key}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{f.label}</dt>
              <dd className="mt-0.5 text-sm text-slate-800">{client[f.key] || "—"}</dd>
            </div>
          ))}
        </dl>

        {client.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {client.tags.map((tag) => (
              <span key={tag} className="badge bg-brand-50 text-brand-700">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Portals &amp; credentials</h2>
          {!showAddPortal && (
            <button className="text-sm font-medium text-brand-600 hover:text-brand-700" onClick={() => setShowAddPortal(true)}>
              + Add portal
            </button>
          )}
        </div>

        {showAddPortal && (
          <div className="mb-4">
            <AddPortalAccountForm
              clientId={params.id}
              excludePortalIds={(portalAccounts.data ?? []).map((a) => a.portalId)}
              onDone={() => setShowAddPortal(false)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(portalAccounts.data ?? []).map((account) => (
            <PortalAccountCard key={account.id} account={account} />
          ))}
          {portalAccounts.data?.length === 0 && !showAddPortal && (
            <p className="text-sm text-slate-400">
              No portals linked yet. Add one to start storing credentials for GST, Income Tax, TRACES, MCA, and more.
            </p>
          )}
        </div>
      </div>

      {client.assignments.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Assigned team</h2>
          <div className="card divide-y divide-slate-100">
            {client.assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-slate-800">{a.member.user.fullName}</span>
                <span className="text-slate-400">{a.assignedRole || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
