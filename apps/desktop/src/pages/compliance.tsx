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
} from "../lib/hooks";
import { formatDateTime } from "../lib/format";

function isOverdue(dueDate: string, status: string) {
  return status !== "FILED" && status !== "VERIFIED" && status !== "NOT_APPLICABLE" && new Date(dueDate) < new Date();
}

export function CompliancePage() {
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
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Compliance</h2>
          <p className="muted" style={{ margin: "2px 0 0" }}>{items.data?.meta?.total ?? 0} total</p>
        </div>
        {!showCreate && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Track a filing
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select className="input" value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={!form.clientId || !form.complianceTypeId || !form.financialYear || !form.dueDate || createItem.isPending}
              onClick={onCreate}
            >
              {createItem.isPending ? "Adding…" : "Add"}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <select className="input" style={{ maxWidth: 200, marginBottom: 12 }} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {COMPLIANCE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Filing</th>
              <th>FY</th>
              <th>Due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.isLoading && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Loading…
                </td>
              </tr>
            )}
            {items.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>
                  Nothing tracked yet.
                </td>
              </tr>
            )}
            {items.data?.data.map((i) => (
              <tr key={i.id}>
                <td>{i.client?.name}</td>
                <td className="muted">{i.complianceType?.name}</td>
                <td className="muted">{i.financialYear}</td>
                <td className="muted" style={isOverdue(i.dueDate, i.status) ? { color: "#dc2626", fontWeight: 500 } : undefined}>
                  {formatDateTime(i.dueDate)}
                </td>
                <td>
                  <select
                    className="input"
                    style={{ marginBottom: 0, padding: "4px 8px", fontSize: 12 }}
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
                <td style={{ textAlign: "right" }}>
                  <button
                    className="btn btn-secondary"
                    style={{ color: "#dc2626" }}
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
