"use client";

import { useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import { usePortalCatalog, useCreatePortalAccount } from "@/lib/hooks";

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
    return <p className="text-sm text-slate-400">All catalog portals are already linked to this client.</p>;
  }

  return (
    <div className="card space-y-3 p-4">
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          className="btn-primary text-xs"
          disabled={!portalId || !identifier || createAccount.isPending}
          onClick={onSubmit}
        >
          {createAccount.isPending ? "Adding…" : "Add portal"}
        </button>
        <button className="btn-secondary text-xs" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
