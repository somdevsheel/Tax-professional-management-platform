import { useParams } from "react-router-dom";
import { useClient, usePortalAccounts } from "../lib/hooks";
import { PortalLaunchCard } from "../components/portal-launch-card";

export function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id!;
  const client = useClient(clientId);
  const portalAccounts = usePortalAccounts(clientId);

  if (client.isLoading) return <p className="muted">Loading…</p>;
  if (!client.data) return <p className="error-text">Client not found.</p>;

  return (
    <div>
      <h2 style={{ marginBottom: 4, fontSize: 18 }}>{client.data.name}</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
        {client.data.entityType.replace(/_/g, " ")} · {client.data.pan || client.data.gstin || "—"}
      </p>

      <h3 style={{ fontSize: 13, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.03em" }}>
        Portals
      </h3>
      {(portalAccounts.data ?? []).length === 0 && (
        <p className="muted">No portals linked for this client yet — add one from the web app.</p>
      )}
      {(portalAccounts.data ?? []).map((account) => (
        <PortalLaunchCard key={account.id} account={account} clientId={clientId} />
      ))}
    </div>
  );
}
