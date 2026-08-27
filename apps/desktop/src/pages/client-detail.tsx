import { useState } from "react";
import { useParams } from "react-router-dom";
import { useClient, usePortalAccounts } from "../lib/hooks";
import { PortalLaunchCard } from "../components/portal-launch-card";
import { AddPortalAccountForm } from "../components/add-portal-account-form";

const INFO_FIELDS: Array<{ key: "pan" | "gstin" | "tan" | "cin" | "email" | "phone"; label: string }> = [
  { key: "pan", label: "PAN" },
  { key: "gstin", label: "GSTIN" },
  { key: "tan", label: "TAN" },
  { key: "cin", label: "CIN" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

export function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id!;
  const client = useClient(clientId);
  const portalAccounts = usePortalAccounts(clientId);
  const [showAddPortal, setShowAddPortal] = useState(false);

  if (client.isLoading) return <p className="muted">Loading…</p>;
  if (!client.data) return <p className="error-text">Client not found.</p>;

  const data = client.data;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{data.name}</h2>
            <p className="muted" style={{ marginTop: 4 }}>{data.entityType.replace(/_/g, " ")}</p>
          </div>
          <span className="badge">{data.status}</span>
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
