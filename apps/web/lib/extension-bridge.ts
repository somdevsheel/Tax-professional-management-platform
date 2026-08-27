"use client";

// Talks to the companion browser extension (apps/extension) for real portal autofill from the
// web app — something a web page can never do on its own (no page can reach into a different
// origin's tab; that's enforced by the browser itself, not a gap in this code). The extension
// is the standard, correct way to get that capability in a browser context, the same
// mechanism every password-manager browser integration uses. See apps/extension/README.md.
//
// This module only ever talks to a fixed, known extension id (not "any extension that
// answers") and only ever sends it a portal-session's already-scoped one-time token — never
// the caller's own JWT, never a stored/long-lived secret.
const EXTENSION_ID = "hehjpkcbogjmkeippdcfkgnkmdkameem";

interface ChromeRuntime {
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response: unknown) => void,
  ) => void;
  lastError?: { message?: string };
}

function getChromeRuntime(): ChromeRuntime | null {
  const w = window as unknown as { chrome?: { runtime?: ChromeRuntime } };
  return w.chrome?.runtime ?? null;
}

export async function isExtensionInstalled(): Promise<boolean> {
  const runtime = getChromeRuntime();
  if (!runtime) return false;
  return new Promise((resolve) => {
    try {
      runtime.sendMessage(EXTENSION_ID, { type: "PING" }, () => {
        resolve(!runtime.lastError);
      });
      // Some browsers never invoke the callback when the extension doesn't exist at all —
      // don't hang the caller forever waiting for a reply that isn't coming.
      setTimeout(() => resolve(false), 500);
    } catch {
      resolve(false);
    }
  });
}

export interface FillPortalLoginRequest {
  apiBaseUrl: string;
  portalCode: string;
  loginUrl: string;
  sessionId: string;
  oneTimeToken: string;
}

export async function fillPortalLogin(
  request: FillPortalLoginRequest,
): Promise<{ ok: boolean; error?: string }> {
  const runtime = getChromeRuntime();
  if (!runtime) return { ok: false, error: "Browser extension not available" };
  return new Promise((resolve) => {
    runtime.sendMessage(EXTENSION_ID, { type: "FILL_PORTAL_LOGIN", ...request }, (response) => {
      if (runtime.lastError) {
        resolve({ ok: false, error: runtime.lastError.message ?? "Extension did not respond" });
        return;
      }
      resolve(response as { ok: boolean; error?: string });
    });
  });
}
