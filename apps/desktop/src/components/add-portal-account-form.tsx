import { useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import { usePortalCatalog, useCreatePortalAccount } from "../lib/hooks";

export function AddPortalAccountForm({
  clientId,
  excludePortalIds,
  onDone,
}: {
  clientId: string;
  excludePortalIds: string[];
  onDone: () => void;
}) {
  const catalog = usePortalCatalog();
  const createAccount = useCreatePortalAccount(clientId);
  const available = (catalog.data ?? []).filter((p) => !excludePortalIds.includes(p.id));

  const [portalId, setPortalId] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    try {
      await createAccount.mutateAsync({ portalId, identifier });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add portal.");
    }
  }

  if (available.length === 0) {
    return <p className="muted">All catalog portals are already linked to this client.</p>;
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <select className="input" value={portalId} onChange={(e) => setPortalId(e.target.value)}>
        <option value="">Select a portal…</option>
        {available.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        className="input"
        placeholder="Identifier (e.g. GSTIN, PAN)"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={!portalId || !identifier || createAccount.isPending}
          onClick={onSubmit}
        >
          {createAccount.isPending ? "Adding…" : "Add portal"}
        </button>
        <button className="btn btn-secondary" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
