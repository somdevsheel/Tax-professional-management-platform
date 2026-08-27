"use client";

import { useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import { COMPLIANCE_STATUSES } from "@tax-platform/types";
import {
  useClients,
  useComplianceCatalog,
  useComplianceItems,
  useCreateComplianceItem,
  useDeleteComplianceItem,
  useUpdateComplianceItem,
} from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";

const STATUS_BADGE: Record<string, string> = {
  UPCOMING: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  FILED: "bg-green-50 text-green-700",
  VERIFIED: "bg-green-100 text-green-800",
  OVERDUE: "bg-red-50 text-red-700",
  NOT_APPLICABLE: "bg-slate-100 text-slate-400",
};

function isOverdue(dueDate: string, status: string) {
  return status !== "FILED" && status !== "VERIFIED" && status !== "NOT_APPLICABLE" && new Date(dueDate) < new Date();
}

export default function CompliancePage() {
  const [status, setStatus] = useState("");
  const clients = useClients({});
  const catalog = useComplianceCatalog();
  const items = useComplianceItems({ status: status || undefined });
  const createItem = useCreateComplianceItem();
  const updateItem = useUpdateComplianceItem();
  const deleteItem = useDeleteComplianceItem();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ clientId: "", complianceTypeId: "", financialYear: "", dueDate: "" });
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    try {
      await createItem.mutateAsync({
        clientId: form.clientId,
        body: { complianceTypeId: form.complianceTypeId, financialYear: form.financialYear, dueDate: form.dueDate },
      });
      setForm({ clientId: "", complianceTypeId: "", financialYear: "", dueDate: "" });
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create compliance item.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Compliance</h1>
          <p className="text-sm text-slate-500">{items.data?.meta?.total ?? 0} total</p>
        </div>
        {!showCreate && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            Track a filing
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card space-y-3 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              className="input"
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            >
              <option value="">Select client…</option>
              {(clients.data?.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={form.complianceTypeId}
              onChange={(e) => setForm((f) => ({ ...f, complianceTypeId: e.target.value }))}
            >
              <option value="">Select filing type…</option>
              {(catalog.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.periodicity})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              className="input"
              placeholder="Financial year (e.g. 2025-26)"
              value={form.financialYear}
              onChange={(e) => setForm((f) => ({ ...f, financialYear: e.target.value }))}
            />
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              className="btn-primary text-xs"
              disabled={!form.clientId || !form.complianceTypeId || !form.financialYear || !form.dueDate || createItem.isPending}
              onClick={onCreate}
            >
              {createItem.isPending ? "Adding…" : "Add"}
            </button>
            <button className="btn-secondary text-xs" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <select className="input max-w-[200px]" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {COMPLIANCE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Filing</th>
              <th className="px-5 py-3">FY</th>
              <th className="px-5 py-3">Due</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.isLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {items.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  Nothing tracked yet.
                </td>
              </tr>
            )}
            {items.data?.data.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{i.client?.name}</td>
                <td className="px-5 py-3 text-slate-500">{i.complianceType?.name}</td>
                <td className="px-5 py-3 text-slate-500">{i.financialYear}</td>
                <td className={`px-5 py-3 ${isOverdue(i.dueDate, i.status) ? "font-medium text-red-600" : "text-slate-500"}`}>
                  {formatDateTime(i.dueDate)}
                </td>
                <td className="px-5 py-3">
                  <select
                    className={`badge border-0 text-xs ${STATUS_BADGE[i.status]}`}
                    value={i.status}
                    onChange={(e) => updateItem.mutate({ id: i.id, body: { status: e.target.value } })}
                  >
                    {COMPLIANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    className="text-xs text-red-600 hover:text-red-700"
                    onClick={() => deleteItem.mutateAsync(i.id).catch(() => undefined)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
