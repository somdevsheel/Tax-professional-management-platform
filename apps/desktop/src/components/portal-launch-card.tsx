import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PortalAccount } from "@tax-platform/api-client";
import { ApiError } from "@tax-platform/api-client";
import { apiClient } from "../lib/api";

type Phase = "idle" | "launching" | "awaiting_challenge" | "error";

/**
 * The desktop half of the product's signature workflow (docs/system-design.md §4): open the
 * portal, fill username/password, then stop and hand control to the human for
 * CAPTCHA/OTP/MFA. Every transition is reported to the backend for the audit trail
 * (docs/browser-automation-design.md §5).
 */
export function PortalLaunchCard({ account, clientId }: { account: PortalAccount; clientId: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasCredential = (account.credentials ?? []).some((c) => c.status === "ACTIVE");

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

      {!hasCredential && phase === "idle" && (
        <p className="muted" style={{ marginTop: 8 }}>
          No credential stored yet — add one from the web app first.
        </p>
      )}

      {phase === "awaiting_challenge" && (
        <div className="challenge-banner" style={{ marginTop: 10 }}>
          <p style={{ margin: "0 0 8px" }}>
            Username and password have been filled in the portal window. Complete any
            CAPTCHA/OTP/MFA there, then come back and click Continue.
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
    </div>
  );
}
