// Portal selector registry — the browser-extension counterpart of
// apps/desktop/src-tauri/src/portals/mod.rs. Selectors are duplicated here rather than shared
// across the two automation engines (Rust vs. this extension) because they're plain data with
// no shared runtime between a native binary and a browser extension; keeping both registries
// small and in the same shape they're in here makes that duplication cheap to keep in sync.
//
// Verification status (docs/development-roadmap.md, Phase 5 / this session's live tests):
// GST's selectors were confirmed against the real, rendered gst.gov.in login page (inspected
// live, not guessed) — id="username" / id="user_pass". MCA's were confirmed 2026-08-26 across two
// independent passes over view-source of its real V3 sign-in page (mca.gov.in blocks automated
// fetches and runs an anti-devtools script, so this was pulled manually) — see the matching
// comment in apps/desktop/src-tauri/src/portals/mod.rs for the full trail. MCA's selector is a
// comma-separated CSS list so querySelector tries several candidates. Every other portal below is
// still an unverified placeholder, exactly like the Rust registry.
// INCOME_TAX's selectors were confirmed live 2026-08-26 the same way as MCA's, but via live
// DevTools (Elements/Console) rather than view-source — this portal serves an empty shell to a
// non-browser fetch (client-rendered Angular), so static HTML wasn't an option. Unlike every
// other portal here, login is a genuine two-step wizard: a User ID screen with its own
// "Continue" button client-side-routes to a separate Password screen whose <input> doesn't exist
// until that navigation happens. continueSelector + passwordScreenUrlMarker, when both present,
// tell fillCredentialFields this is a multi-screen flow — see its comment for how that's driven.
export const PORTAL_SELECTORS = {
  GST: { usernameSelector: "#username", passwordSelector: "#user_pass" },
  INCOME_TAX: {
    // "#panAadhaarUserId" and "#panAdhaarUserId" (one fewer "a") were both captured live from
    // the real rendered page in independent sessions, 2026-08-26 — this portal's own id is
    // apparently inconsistent between renders/deploys, so both are matched rather than picking one.
    usernameSelector: "#panAadhaarUserId, #panAdhaarUserId, input[name='panAadhaarUserId'], input[name='panAdhaarUserId']",
    continueSelector: "#continueBtnNav",
    passwordSelector: "#loginPasswordField",
    passwordScreenUrlMarker: "/login/password",
  },
  TRACES: { usernameSelector: "#userName", passwordSelector: "#password" },
  MCA: {
    usernameSelector: ".userID input[type='text'], input[name='userID'], .userID input",
    passwordSelector: ".password input[type='password'], input[name='password'], .password-input input[type='password']",
  },
  EPFO: { usernameSelector: "#userid", passwordSelector: "#pass" },
  ESIC: { usernameSelector: "#username", passwordSelector: "#password" },
  DGFT: { usernameSelector: "#username", passwordSelector: "#password" },
};

/**
 * Injected into the portal tab via chrome.scripting.executeScript. Must be fully
 * self-contained (no closures over outer scope — only its own parameters) because Chrome
 * serializes and runs it inside the target page's own JS context, not this extension's, and
 * because — for a multi-screen portal — background.js re-injects a *fresh* copy of this same
 * function on every subsequent navigation rather than relying on one running copy to survive
 * across screens (see below for why that assumption doesn't hold).
 *
 * Same polling design as the desktop Rust adapter's fill script, and for the same reason,
 * found by actually testing this live: `chrome.tabs.create` resolves once the tab exists, not
 * once the portal's own framework has finished rendering the login form. Polls for up to ~15s
 * before giving up. Never reads the DOM back for any other purpose, never touches any field
 * beyond the ones given, never calls submit() — CAPTCHA/OTP/MFA are left entirely to the human
 * (docs/browser-automation-design.md §6).
 *
 * passwordScreenUrlMarker is optional. When absent (most portals), this fills both fields on one
 * screen, exactly as before. When present (INCOME_TAX, confirmed live 2026-08-26 — see
 * PORTAL_SELECTORS above), the password field doesn't exist until a "Continue" button is clicked
 * past the username screen — this decides which single field to target purely by checking
 * `location.href` for that marker, deliberately with no state carried between injections. A
 * stateful phase-machine version (fill username, click Continue, keep running to fill password
 * once it appears) was tried first and doesn't work: this portal's navigation from the User ID
 * screen to the Password screen does not reliably keep a script's own running JS execution
 * context (including any in-progress polling timer) alive, even though the URL only changes by
 * hash — a plain Chrome tab navigation is if anything more likely to tear down an injected
 * script's state than the desktop app's webview is, not less. background.js's
 * `chrome.webNavigation.onHistoryStateUpdated` listener re-runs this same function fresh after
 * each such navigation for exactly this reason; each fresh run independently figures out which
 * screen it's on from the URL, so nothing needs to survive between them.
 *
 * Every screen keeps re-asserting its field's value (rather than filling once and stopping)
 * until it's held steady for two consecutive ticks — mirrors
 * apps/desktop/src-tauri/src/portals/mod.rs's build_fill_script: some portals (MCA's AEM-based
 * login, confirmed live 2026-08-26) server-render the <input> elements up front, so a one-shot
 * fill lands on real elements and appears to succeed, but the page's own JS framework then
 * hydrates and rebuilds that part of the DOM a moment later, silently wiping whatever was just
 * set.
 *
 * Uses visibleEl (querySelectorAll filtered to elements with a non-empty getClientRects())
 * instead of a plain querySelector — also mirrors the Rust adapter, added after live testing on
 * INCOME_TAX found a selector transiently answered with a hidden element (a dialog/template
 * instance) that shared an id with the visible one, so a lookup could silently act on the wrong
 * element. Deliberately not `offsetParent !== null`, a common but broken visibility check that
 * false-negatives for `position: fixed` elements (fully visible, offsetParent still null) — a
 * real bug this shipped with briefly before being caught by live testing.
 */
export function fillCredentialFields(usernameSelector, passwordSelector, username, password, continueSelector, passwordScreenUrlMarker) {
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function visibleEl(selector) {
    const matches = document.querySelectorAll(selector);
    for (const el of matches) {
      if (el.getClientRects().length > 0) return el;
    }
    return null;
  }

  const onPasswordScreen = !!passwordScreenUrlMarker && location.href.indexOf(passwordScreenUrlMarker) !== -1;
  let attempts = 0;
  const maxAttempts = 100;
  let stableTicks = 0;
  const timer = setInterval(() => {
    attempts++;
    if (onPasswordScreen) {
      const passEl = visibleEl(passwordSelector);
      if (passEl) {
        if (passEl.value === password) {
          stableTicks++;
        } else {
          setNativeValue(passEl, password);
          stableTicks = 0;
        }
      } else {
        stableTicks = 0;
      }
    } else {
      const userEl = visibleEl(usernameSelector);
      if (userEl) {
        if (continueSelector) {
          // Multi-screen portal: only the username field belongs on this screen.
          if (userEl.value === username) {
            stableTicks++;
          } else {
            setNativeValue(userEl, username);
            stableTicks = 0;
          }
          if (stableTicks >= 2) {
            const btn = visibleEl(continueSelector);
            if (btn && !btn.disabled) btn.click();
          }
        } else {
          // Single-screen portal: both fields live here.
          const passEl = visibleEl(passwordSelector);
          if (passEl) {
            if (userEl.value === username && passEl.value === password) {
              stableTicks++;
            } else {
              setNativeValue(userEl, username);
              setNativeValue(passEl, password);
              stableTicks = 0;
            }
          } else {
            stableTicks = 0;
          }
        }
      } else {
        stableTicks = 0;
      }
    }
    if (stableTicks >= 2 || attempts >= maxAttempts) {
      clearInterval(timer);
    }
  }, 250);
}
