"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@tax-platform/api-client";
import type { PortalAccount } from "@tax-platform/api-client";
import { useCreateCredential, useCredentials, useDeleteCredential, useRotateCredential } from "@/lib/hooks";
import { formatDateTime } from "@/lib/format";
import { apiClient, API_BASE_URL } from "@/lib/api";
import { fillPortalLogin, isExtensionInstalled } from "@/lib/extension-bridge";
import { ExternalLinkIcon, LockIcon } from "./icons";
import { RevealCredentialModal } from "./reveal-credential-modal";

type LaunchPhase = "idle" | "launching" | "awaiting_challenge" | "error";

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

  const [extensionAvailable, setExtensionAvailable] = useState<boolean | null>(null);
  const [launchPhase, setLaunchPhase] = useState<LaunchPhase>("idle");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    isExtensionInstalled().then(setExtensionAvailable);
  }, []);

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

  // Real autofill via the companion browser extension (apps/extension) — the same
  // open -> redeem-credential-in-a-trusted-context -> fill -> stop-for-CAPTCHA flow the
  // desktop app runs in Rust, just running in the extension's background service worker
  // instead. A plain web page cannot do this itself (docs/browser-automation-design.md).
  async function onOpenPortalViaExtension() {
    setLaunchError(null);
    setLaunchPhase("launching");
    let currentSessionId: string | null = null;
    try {
      const session = await apiClient.portalSessions.create(account.clientId, account.id);
      currentSessionId = session.id;
      setSessionId(session.id);

      await apiClient.portalSessions.reportEvent(session.id, "navigating_to_login").catch(() => undefined);

      const result = await fillPortalLogin({
        apiBaseUrl: API_BASE_URL,
        portalCode: account.portal.code,
        loginUrl: account.portal.loginUrl,
        sessionId: session.id,
        oneTimeToken: session.oneTimeToken,
      });

      if (!result.ok) {
        throw new Error(result.error ?? "The extension could not fill this portal's login page.");
      }

      await apiClient.portalSessions.reportEvent(session.id, "awaiting_user_challenge").catch(() => undefined);
      setLaunchPhase("awaiting_challenge");
    } catch (err) {
      if (currentSessionId) {
        await apiClient.portalSessions.reportEvent(currentSessionId, "failed").catch(() => undefined);
      }
      setLaunchError(err instanceof Error ? err.message : "Could not open this portal.");
      setLaunchPhase("error");
    }
  }

  async function onContinueLogin() {
    if (sessionId) {
      await apiClient.portalSessions.reportEvent(sessionId, "completed").catch(() => undefined);
    }
    setLaunchPhase("idle");
    setSessionId(null);
  }

  async function onCancelLogin() {
    if (sessionId) {
      await apiClient.portalSessions.reportEvent(sessionId, "failed").catch(() => undefined);
    }
    setLaunchPhase("idle");
    setSessionId(null);
  }

  const hasCredential = !!activeCredential;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{account.portal.name}</h3>
          <p className="text-xs text-slate-500">{account.identifier}</p>
        </div>
        {extensionAvailable && hasCredential ? (
          <button
            className="btn-secondary gap-1.5 text-xs"
            onClick={onOpenPortalViaExtension}
            disabled={launchPhase === "launching" || launchPhase === "awaiting_challenge"}
          >
            {launchPhase === "launching" ? "Opening…" : "Open portal (autofill)"}
          </button>
        ) : (
          <a
            href={account.portal.loginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary gap-1.5 text-xs"
          >
            Open portal <ExternalLinkIcon width={14} height={14} />
          </a>
        )}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {extensionAvailable
          ? "Autofill fills username/password only, then stops for you to complete CAPTCHA/OTP."
          : "Install the portal-autofill browser extension for one-click autofill — see apps/extension/README.md. Autofill is also available in the desktop app."}
      </p>

      {launchPhase === "awaiting_challenge" && (
        <div className="challenge-banner mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <p className="mb-2">
            Username and password were sent to the portal tab — if the fields didn&apos;t populate
            automatically (the portal&apos;s login page may not have loaded, or its layout changed),
            enter them manually. Complete any CAPTCHA/OTP/MFA there, then come back and click
            Continue.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary text-xs" onClick={onContinueLogin}>
              I&apos;ve completed login, continue
            </button>
            <button className="btn-secondary text-xs" onClick={onCancelLogin}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {launchPhase === "error" && launchError && (
        <div className="mt-3">
          <p className="text-xs text-red-600">{launchError}</p>
          <button className="btn-secondary mt-1 text-xs" onClick={() => setLaunchPhase("idle")}>
            Dismiss
          </button>
        </div>
      )}

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
