"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import { apiClient } from "@/lib/api";
import { LockIcon } from "./icons";

const AUTO_HIDE_MS = 30_000;

/**
 * Step-up re-authentication modal for revealing a credential's plaintext
 * (docs/security-design.md §6). Plaintext is held only in this component's local state,
 * never cached by React Query, and is cleared automatically after 30s or when the modal closes.
 */
export function RevealCredentialModal({ credentialId, onClose }: { credentialId: string; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [revealed]);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiClient.credentials.reveal(credentialId, password);
      setRevealed(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reveal credential.");
    } finally {
      setSubmitting(false);
      setPassword("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center gap-2">
          <LockIcon className="text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Reveal credential</h2>
        </div>

        {!revealed ? (
          <>
            <p className="mt-2 text-sm text-slate-500">
              Confirm it&apos;s you — enter your account password to reveal this credential. This is logged.
            </p>
            <div className="mt-4">
              <input
                type="password"
                autoFocus
                className="input"
                placeholder="Your account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              />
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" disabled={submitting || !password} onClick={onSubmit}>
                {submitting ? "Verifying…" : "Reveal"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 space-y-3">
              <Field label="Username" value={revealed.username} />
              <Field label="Password" value={revealed.password} />
            </div>
            <p className="mt-3 text-xs text-slate-400">Hides automatically in 30 seconds.</p>
            <div className="mt-5 flex justify-end">
              <button className="btn-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md bg-slate-100 px-2 py-1.5 text-sm">{value}</code>
        <button
          className="btn-secondary text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
