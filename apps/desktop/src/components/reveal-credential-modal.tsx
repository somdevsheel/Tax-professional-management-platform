import { useEffect, useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import { apiClient } from "../lib/api";

const AUTO_HIDE_MS = 30_000;

/**
 * Step-up re-authentication modal for revealing a credential's plaintext
 * (docs/security-design.md §6) — desktop counterpart of apps/web/components/reveal-credential-modal.tsx,
 * same behavior: plaintext lives only in this component's local state, never cached by React
 * Query, cleared automatically after 30s or when the modal closes.
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 42, 0.4)",
        padding: 16,
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 360 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Reveal credential</h2>

        {!revealed ? (
          <>
            <p className="muted" style={{ marginTop: 8 }}>
              Confirm it&apos;s you — enter your account password to reveal this credential. This is logged.
            </p>
            <input
              type="password"
              autoFocus
              className="input"
              placeholder="Your account password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            />
            {error && <p className="error-text">{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={submitting || !password} onClick={onSubmit}>
                {submitting ? "Verifying…" : "Reveal"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginTop: 12 }}>
              <Field label="Username" value={revealed.username} />
              <Field label="Password" value={revealed.password} />
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Hides automatically in 30 seconds.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={onClose}>
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
    <div style={{ marginBottom: 10 }}>
      <p className="muted" style={{ margin: "0 0 4px" }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <code
          style={{
            flex: 1,
            background: "#f1f5f9",
            borderRadius: 6,
            padding: "6px 8px",
            fontSize: 13,
            wordBreak: "break-all",
          }}
        >
          {value}
        </code>
        <button
          className="btn btn-secondary"
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
