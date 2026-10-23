import { useState } from "react";
import { useParams } from "react-router-dom";
import { CLIENT_STATUSES } from "@tax-platform/types";
import { useClient, usePortalAccounts, useUpdateClient } from "../lib/hooks";
import { PortalLaunchCard } from "../components/portal-launch-card";
import { AddPortalAccountForm } from "../components/add-portal-account-form";
import { EditClientForm } from "../components/edit-client-form";
import { ComplianceCalendarCard } from "../components/compliance-calendar-card";

const INFO_FIELDS: Array<{
  key: "pan" | "gstin" | "tan" | "cin" | "email" | "phone" | "contactPerson" | "financialYear" | "assessmentYear";
  label: string;
}> = [
  { key: "pan", label: "PAN" },
  { key: "gstin", label: "GSTIN" },
  { key: "tan", label: "TAN" },
  { key: "cin", label: "CIN" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "contactPerson", label: "Contact person" },
  { key: "financialYear", label: "Financial year" },
  { key: "assessmentYear", label: "Assessment year" },
];

export function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id!;
  const client = useClient(clientId);
  const portalAccounts = usePortalAccounts(clientId);
  const updateClient = useUpdateClient(clientId);
  const [showAddPortal, setShowAddPortal] = useState(false);
  const [editing, setEditing] = useState(false);

  if (client.isLoading) return <p className="muted">Loading…</p>;
  if (!client.data) return <p className="error-text">Client not found.</p>;

  const data = client.data;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        {editing ? (
          <>
            <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>Edit client details</h2>
            <EditClientForm client={data} onDone={() => setEditing(false)} />
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{data.name}</h2>
                <p className="muted" style={{ marginTop: 4 }}>{data.entityType.replace(/_/g, " ")}</p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  className="input"
                  style={{ width: "auto", marginBottom: 0, padding: "4px 8px", fontSize: 12 }}
                  value={data.status}
                  onChange={(e) => updateClient.mutate({ status: e.target.value })}
                >
                  {CLIENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                  Edit details
                </button>
              </div>
            </div>

            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 14,
                marginTop: 18,
              }}
            >
              {INFO_FIELDS.map((f) => (
                <div key={f.key}>
                  <dt className="muted" style={{ textTransform: "uppercase", letterSpacing: "0.03em", fontSize: 11 }}>
                    {f.label}
                  </dt>
                  <dd style={{ margin: "2px 0 0", fontSize: 14 }}>{data[f.key] || "—"}</dd>
                </div>
              ))}
            </dl>

            {data.tags.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.tags.map((tag) => (
                  <span key={tag} className="badge" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {data.notes && (
              <p style={{ marginTop: 14, marginBottom: 0, fontSize: 13, whiteSpace: "pre-wrap", color: "#475569" }}>{data.notes}</p>
            )}

            {updateClient.isError && <p className="error-text">Could not update status.</p>}
          </>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.03em", margin: 0 }}>
            Portals &amp; credentials
          </h3>
          {!showAddPortal && (
            <button className="btn btn-secondary" onClick={() => setShowAddPortal(true)}>
              + Add portal
            </button>
          )}
        </div>

        {showAddPortal && (
          <AddPortalAccountForm
            clientId={clientId}
            excludePortalIds={(portalAccounts.data ?? []).map((a) => a.portalId)}
            onDone={() => setShowAddPortal(false)}
          />
        )}

        {(portalAccounts.data ?? []).length === 0 && !showAddPortal && (
          <p className="muted">No portals linked yet. Add one to start storing credentials for GST, Income Tax, TRACES, MCA, and more.</p>
        )}
        {(portalAccounts.data ?? []).map((account) => (
          <PortalLaunchCard key={account.id} account={account} clientId={clientId} />
        ))}
      </div>

      <ComplianceCalendarCard clientId={clientId} />

      {data.assignments.length > 0 && (
        <div>
          <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.03em" }}>
            Assigned team
          </h3>
          <div className="card" style={{ padding: 0 }}>
            {data.assignments.map((a) => (
              <div key={a.id} className="list-row" style={{ padding: "10px 16px" }}>
                <span>{a.member.user.fullName}</span>
                <span className="muted">{a.assignedRole || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
