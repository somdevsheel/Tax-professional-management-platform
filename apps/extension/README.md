# Portal Autofill Browser Extension

The browser-native equivalent of the desktop app's portal launcher — the only way a *web page*
can get real autofill into a different site's login form, since browsers correctly block a
website's own JS from reaching into another tab (see
[docs/browser-automation-design.md](../../docs/browser-automation-design.md)). This is the same
mechanism every password-manager browser integration uses.

## Design

Deliberately "dumb," mirroring `apps/desktop/src-tauri/src/commands.rs`: the web app owns all
business logic (creating the portal session via the normal authenticated REST API, reporting
lifecycle events, the CAPTCHA-wait UI). The extension does exactly one thing when asked: redeem
a portal-session's one-time token for the transient plaintext credential, open the portal's
login page, and fill the two configured fields — then stop. It never touches CAPTCHA/OTP
fields, never calls submit(), never stores anything beyond the instant of that one operation.

```
apps/web (React)  --chrome.runtime.sendMessage(EXTENSION_ID, ...)-->  background.js (service worker)
                                                                              |
                                                                              v
                                                          fetch one-time credential from the API
                                                                              |
                                                                              v
                                                    chrome.tabs.create + chrome.scripting.executeScript
                                                          (fills username/password, polling for
                                                           the fields to render, then stops)
```

`portals.js` holds the selector registry — the extension's counterpart to the Rust desktop
adapter registry (`apps/desktop/src-tauri/src/portals/mod.rs`). Selectors are duplicated
between the two rather than shared, since there's no shared runtime between a native binary and
a browser extension; keep both in sync when a selector changes.

**Verification status:** GST's selectors (`#username` / `#user_pass`) were confirmed against
the real, live gst.gov.in login page — inspected directly, not guessed — and the full flow
(web app → extension → real GST tab, username/password filled, CAPTCHA left untouched) was
run end to end with a real Chrome instance on a real screen. That run also caught a real bug:
the fill script fired before the portal's Angular app had rendered the form, so the first
attempt filled nothing — fixed by polling for the fields (up to ~10s) instead of a one-shot
fill, in `fillCredentialFields` in `portals.js`. Every other portal in the registry is still an
unverified placeholder, same caveat as the desktop app.

## Installing it (development / unpacked)

Chrome/Edge only supports loading an unpacked extension via developer mode — there's no build
step, it's plain JS:

1. Go to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**, select this `apps/extension` directory.
4. Confirm it loaded with the id `hehjpkcbogjmkeippdcfkgnkmdkameem` — this id is pinned via the
   `key` field in `manifest.json` (the corresponding private key is *not* committed; the `key`
   field itself is the public key and is safe to be in the repo — it only fixes the extension's
   id across reloads, standard practice for exactly this reason). The web app hardcodes this
   same id in `apps/web/lib/extension-bridge.ts` to know who to talk to.

The web app detects the extension automatically (a `PING` message on each portal card's mount)
and switches its "Open portal" button to "Open portal (autofill)" once it answers.

## Production note

`host_permissions` includes `http://localhost/*` for local development against the API. A real
deployment must scope that to the actual production API origin instead — a wildcard localhost
permission has no meaning once this isn't running against a dev server, but it should still be
tightened rather than left as a stale, meaningless-but-technically-broad permission.
