"use client";

import { useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import type { PortalAccount } from "@tax-platform/api-client";
import { useCreateCredential, useCredentials, useDeleteCredential, useRotateCredential } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { ExternalLinkIcon, LockIcon } from "./icons";
import { RevealCredentialModal } from "./reveal-credential-modal";

export function PortalAccountCard({ account }: { account: PortalAccount }) {
  const credentials = useCredentials(account.id);
  const createCredential = useCreateCredential(account.id);
  const rotateCredential = useRotateCredential(account.id);
  const deleteCredential = useDeleteCredential(account.id);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showRotateForm, setShowRotateForm] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const activeCredential = credentials.data?.find((c) => c.status !== "REVOKED");

  async function onAddCredential() {
    setFormError(null);
    try {
      await createCredential.mutateAsync({ username, password });
      setUsername("");
      setPassword("");
      setShowAddForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save credential.");
    }
  }

  async function onRotate(id: string) {
    setFormError(null);
    try {
      await rotateCredential.mutateAsync({ id, username: username || undefined, password: password || undefined });
      setUsername("");
      setPassword("");
      setShowRotateForm(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not rotate credential.");
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{account.portal.name}</h3>
          <p className="text-xs text-slate-500">{account.identifier}</p>
        </div>
        <a
          href={account.portal.loginUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary gap-1.5 text-xs"
        >
          Open portal <ExternalLinkIcon width={14} height={14} />
        </a>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Autofill happens in the desktop app, which stops before CAPTCHA/OTP for you to complete manually.
      </p>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <LockIcon width={14} height={14} /> Credential
          </h4>
          {!activeCredential && !showAddForm && (
            <button className="text-xs font-medium text-brand-600 hover:text-brand-700" onClick={() => setShowAddForm(true)}>
              Add credential
            </button>
          )}
        </div>

        {credentials.isLoading && <p className="mt-2 text-xs text-slate-400">Loading…</p>}

        {activeCredential && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="badge bg-green-50 text-green-700">{activeCredential.status}</span>
              <span>Last used: {formatDateTime(activeCredential.lastUsedAt)}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn-secondary text-xs" onClick={() => setRevealingId(activeCredential.id)}>
                Reveal
              </button>
              <button
                className="btn-secondary text-xs"
                onClick={() => setShowRotateForm(showRotateForm === activeCredential.id ? null : activeCredential.id)}
              >
                Rotate
              </button>
              <button
                className="btn-danger text-xs"
                onClick={() => deleteCredential.mutate(activeCredential.id)}
                disabled={deleteCredential.isPending}
              >
                Delete
              </button>
            </div>

            {showRotateForm === activeCredential.id && (
              <div className="mt-2 space-y-2 rounded-md border border-slate-200 p-3">
                <input
                  className="input"
                  placeholder="New username (leave blank to keep current)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <input
                  type="password"
                  className="input"
                  placeholder="New password (leave blank to keep current)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="btn-primary text-xs"
                  disabled={rotateCredential.isPending}
                  onClick={() => onRotate(activeCredential.id)}
                >
                  {rotateCredential.isPending ? "Saving…" : "Save rotation"}
                </button>
              </div>
            )}
          </div>
        )}

        {showAddForm && (
          <div className="mt-2 space-y-2 rounded-md border border-slate-200 p-3">
            <input
              className="input"
              placeholder="Portal username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              className="input"
              placeholder="Portal password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="btn-primary text-xs"
                disabled={createCredential.isPending || !username || !password}
                onClick={onAddCredential}
              >
                {createCredential.isPending ? "Saving…" : "Save credential"}
              </button>
              <button className="btn-secondary text-xs" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
      </div>

      {revealingId && <RevealCredentialModal credentialId={revealingId} onClose={() => setRevealingId(null)} />}
    </div>
  );
}
