import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PortalAccount } from "@tax-platform/api-client";
import { ApiError } from "@tax-platform/api-client";
import { apiClient } from "../lib/api";
import { useCreateCredential, useCredentials, useDeleteCredential, useRotateCredential } from "../lib/hooks";
import { formatDateTime } from "../lib/format";
import { RevealCredentialModal } from "./reveal-credential-modal";

type Phase = "idle" | "launching" | "awaiting_challenge" | "error";

/**
 * The desktop half of the product's signature workflow (docs/system-design.md §4): open the
 * portal, fill username/password, then stop and hand control to the human for
 * CAPTCHA/OTP/MFA. Every transition is reported to the backend for the audit trail
 * (docs/browser-automation-design.md §5).
 *
 * Also owns the same credential lifecycle (add/reveal/rotate/delete) the web app's
 * PortalAccountCard has — the desktop app was originally scoped to the launcher only, but
 * that left it visibly behind the web app for anyone managing credentials day to day
 * (user-reported gap), so this brings the two to parity rather than leaving desktop as a
 * read-only view of what the web app manages.
 */
export function PortalLaunchCard({ account, clientId }: { account: PortalAccount; clientId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const credentials = useCredentials(account.id);
  const createCredential = useCreateCredential(account.id);
  const rotateCredential = useRotateCredential(account.id);
  const deleteCredential = useDeleteCredential(account.id);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showRotateForm, setShowRotateForm] = useState(false);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credFormError, setCredFormError] = useState<string | null>(null);

  const activeCredential = credentials.data?.find((c) => c.status !== "REVOKED");
  const hasCredential = !!activeCredential;

  async function onAddCredential() {
    setCredFormError(null);
    try {
      await createCredential.mutateAsync({ username: credUsername, password: credPassword });
      setCredUsername("");
      setCredPassword("");
      setShowAddForm(false);
    } catch (err) {
      setCredFormError(err instanceof ApiError ? err.message : "Could not save credential.");
    }
  }

  async function onRotate(id: string) {
    setCredFormError(null);
    try {
      await rotateCredential.mutateAsync({
        id,
        username: credUsername || undefined,
        password: credPassword || undefined,
      });
      setCredUsername("");
      setCredPassword("");
      setShowRotateForm(false);
    } catch (err) {
      setCredFormError(err instanceof ApiError ? err.message : "Could not rotate credential.");
    }
  }

  async function onOpenPortal() {
    setError(null);
    setPhase("launching");
    try {
      const session = await apiClient.portalSessions.create(clientId, account.id);
      setSessionId(session.id);

      await invoke("open_portal_window", { portalCode: account.portal.code });
      await apiClient.portalSessions.reportEvent(session.id, "navigating_to_login").catch(() => undefined);

      await invoke("fill_portal_credential", {
        portalCode: account.portal.code,
        sessionId: session.id,
        oneTimeToken: session.oneTimeToken,
      });
      await apiClient.portalSessions.reportEvent(session.id, "awaiting_user_challenge").catch(() => undefined);

      setPhase("awaiting_challenge");
    } catch (err) {
      if (sessionId) {
        await apiClient.portalSessions.reportEvent(sessionId, "failed").catch(() => undefined);
      }
      setError(
        err instanceof ApiError
          ? err.message
          : typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : "Could not open this portal.",
      );
      setPhase("error");
    }
  }

  async function onContinue() {
    if (sessionId) {
      await apiClient.portalSessions.reportEvent(sessionId, "completed").catch(() => undefined);
    }
    await invoke("close_portal_window").catch(() => undefined);
    setPhase("idle");
    setSessionId(null);
  }

  async function onCancel() {
    if (sessionId) {
      await apiClient.portalSessions.reportEvent(sessionId, "failed").catch(() => undefined);
    }
    await invoke("close_portal_window").catch(() => undefined);
    setPhase("idle");
    setSessionId(null);
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>{account.portal.name}</strong>
          <p className="muted" style={{ margin: "2px 0 0" }}>{account.identifier}</p>
        </div>
        {phase === "idle" && (
          <button className="btn btn-primary" disabled={!hasCredential} onClick={onOpenPortal}>
            Open portal
          </button>
        )}
        {phase === "launching" && (
          <button className="btn btn-secondary" disabled>
            Opening…
          </button>
        )}
      </div>

      {phase === "awaiting_challenge" && (
        <div className="challenge-banner" style={{ marginTop: 10 }}>
          <p style={{ margin: "0 0 8px" }}>
            Username and password were sent to the portal window — if the fields didn't populate
            automatically (the portal's login page may not have loaded, or its layout changed),
            enter them manually. Complete any CAPTCHA/OTP/MFA there, then come back and click
            Continue.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={onContinue}>
              I&apos;ve completed login, continue
            </button>
            <button className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8 }}>
          <p className="error-text">{error}</p>
          <button className="btn btn-secondary" onClick={() => setPhase("idle")}>
            Dismiss
          </button>
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className="muted" style={{ margin: 0, textTransform: "uppercase", fontSize: 11, letterSpacing: "0.03em" }}>
            Credential
          </p>
          {!activeCredential && !showAddForm && (
            <button className="btn btn-secondary" onClick={() => setShowAddForm(true)}>
              Add credential
            </button>
          )}
        </div>

        {credentials.isLoading && <p className="muted" style={{ marginTop: 6 }}>Loading…</p>}

        {activeCredential && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="badge" style={{ background: "#dcfce7", color: "#15803d" }}>
                {activeCredential.status}
              </span>
              <span className="muted">Last used: {formatDateTime(activeCredential.lastUsedAt)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn btn-secondary" onClick={() => setRevealingId(activeCredential.id)}>
                Reveal
              </button>
              <button className="btn btn-secondary" onClick={() => setShowRotateForm((v) => !v)}>
                Rotate
              </button>
              <button
                className="btn btn-secondary"
                style={{ background: "#dc2626", color: "#fff" }}
                onClick={() => deleteCredential.mutate(activeCredential.id)}
                disabled={deleteCredential.isPending}
              >
                Delete
              </button>
            </div>

            {showRotateForm && (
              <div style={{ marginTop: 8, border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>
                <input
                  className="input"
                  placeholder="New username (leave blank to keep current)"
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                />
                <input
                  type="password"
                  className="input"
                  placeholder="New password (leave blank to keep current)"
                  value={credPassword}
                  onChange={(e) => setCredPassword(e.target.value)}
                />
                <button
                  className="btn btn-primary"
                  disabled={rotateCredential.isPending}
                  onClick={() => onRotate(activeCredential.id)}
                >
                  {rotateCredential.isPending ? "Saving…" : "Save rotation"}
                </button>
              </div>
            )}
          </div>
        )}

        {!hasCredential && !showAddForm && (
          <p className="muted" style={{ marginTop: 6 }}>No credential stored yet.</p>
        )}

        {showAddForm && (
          <div style={{ marginTop: 8, border: "1px solid #e2e8f0", borderRadius: 8, padding: 10 }}>
            <input
              className="input"
              placeholder="Portal username"
              value={credUsername}
              onChange={(e) => setCredUsername(e.target.value)}
            />
            <input
              type="password"
              className="input"
              placeholder="Portal password"
              value={credPassword}
              onChange={(e) => setCredPassword(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                disabled={createCredential.isPending || !credUsername || !credPassword}
                onClick={onAddCredential}
              >
                {createCredential.isPending ? "Saving…" : "Save credential"}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {credFormError && <p className="error-text">{credFormError}</p>}
      </div>

      {revealingId && <RevealCredentialModal credentialId={revealingId} onClose={() => setRevealingId(null)} />}
    </div>
  );
}
