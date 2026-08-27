// Background service worker. Deliberately "dumb": it does exactly one thing — given a
// portal-session's one-time token (already created by the web app, which owns all the
// business logic and auditing via the normal authenticated REST API), redeem the transient
// plaintext credential and fill it into the two configured fields of a freshly opened portal
// tab. It never creates sessions, never reports lifecycle events, never stores anything long
// term — that all stays in the web app's own code, exactly like the desktop app's Rust core
// only owns credential redemption + fill, not the surrounding CRUD
// (docs/architecture.md §"Why Tauri" / apps/desktop/src-tauri/src/commands.rs).

import { PORTAL_SELECTORS, fillCredentialFields } from "./portals.js";

// Tracks the one credential fill currently in flight per tab, so
// chrome.webNavigation.onHistoryStateUpdated (below) can re-run the fill on a portal whose login
// spans more than one screen — see portals.js's fillCredentialFields comment for why a single
// injection can't just be left running across that navigation. Cleared as soon as the fill lands
// on the portal's own password screen (nothing further to automate after that) or the tab closes.
// In-memory only, same lifetime as every other secret this extension ever touches (never written
// to chrome.storage, never logged) — see handleFillPortalLogin below.
const pendingFillsByTabId = new Map();

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }

  if (message?.type === "FILL_PORTAL_LOGIN") {
    handleFillPortalLogin(message)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
    return true; // keep the message channel open for the async response
  }

  return false;
});

async function handleFillPortalLogin({ apiBaseUrl, portalCode, loginUrl, sessionId, oneTimeToken }) {
  const selectors = PORTAL_SELECTORS[portalCode];
  if (!selectors) {
    return { ok: false, error: `No selector config for portal '${portalCode}'` };
  }

  // Redeem the one-time credential token — never the caller's JWT, never a permanent secret,
  // single use and short-lived by design (docs/security-design.md §6). This is the only place
  // plaintext exists in the extension: it lives in this async function's local scope (and, for
  // a multi-screen portal, in pendingFillsByTabId until that portal's password screen is
  // reached), never persisted to chrome.storage, never logged.
  const credRes = await fetch(`${apiBaseUrl}/portal-sessions/${sessionId}/credential`, {
    headers: { "X-Portal-Session-Token": oneTimeToken, "X-Client-Platform": "extension" },
  });
  const credBody = await credRes.json().catch(() => null);
  if (!credRes.ok || !credBody?.success) {
    return { ok: false, error: credBody?.error?.message ?? "Failed to redeem portal session credential" };
  }
  const { username, password } = credBody.data;

  const tab = await chrome.tabs.create({ url: loginUrl });
  if (!tab.id) {
    return { ok: false, error: "Failed to open portal tab" };
  }

  const args = [
    selectors.usernameSelector,
    selectors.passwordSelector,
    username,
    password,
    selectors.continueSelector,
    selectors.passwordScreenUrlMarker,
  ];

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: fillCredentialFields, args });

  if (selectors.continueSelector && selectors.passwordScreenUrlMarker) {
    pendingFillsByTabId.set(tab.id, { args, passwordScreenUrlMarker: selectors.passwordScreenUrlMarker });
  }

  return { ok: true };
}

// A multi-screen portal's "Continue" click moves it to a new screen via the SPA's own router —
// no full page load, so the one-time injection made when the tab was first opened never gets a
// second chance to run against whatever's on the new screen. Re-injecting a fresh copy here on
// every such navigation fixes that: each fresh run figures out which screen it's now on from the
// URL and either fills the field there or does nothing if there's not one it recognises yet.
// Angular apps route via hash fragments in a couple of different ways depending on how they
// call the History API, so both event types are covered rather than guessing which one a given
// portal uses: onHistoryStateUpdated (history.pushState/replaceState) and
// onReferenceFragmentUpdated (a plain `location.hash =` / anchor-link style change).
function reinjectFillOnNavigation(details) {
  if (details.frameId !== 0) return; // top frame only
  const pending = pendingFillsByTabId.get(details.tabId);
  if (!pending) return;

  chrome.scripting.executeScript({ target: { tabId: details.tabId }, func: fillCredentialFields, args: pending.args }).catch(() => {
    // The tab may have navigated away from the portal entirely by now — nothing to do.
  });

  if (details.url.indexOf(pending.passwordScreenUrlMarker) !== -1) {
    pendingFillsByTabId.delete(details.tabId);
  }
}

chrome.webNavigation.onHistoryStateUpdated.addListener(reinjectFillOnNavigation);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(reinjectFillOnNavigation);

chrome.tabs.onRemoved.addListener((tabId) => {
  pendingFillsByTabId.delete(tabId);
});
