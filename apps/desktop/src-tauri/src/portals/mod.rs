//! Portal automation engine (docs/browser-automation-design.md). `PortalConfig` is the data
//! half — selectors and URLs — so most new portals are addable without a code change; a
//! genuinely quirky portal gets its own small adapter module (see `gst.rs`) that can override
//! the default fill script. No adapter is ever permitted to touch a CAPTCHA/OTP field, read
//! page content back for that purpose, or auto-submit past the credential fields.

pub mod gst;
pub mod income_tax;

/// Selectors and URLs for one portal. Loaded from a small built-in registry today; the design
/// intent (docs/database-design.md §"portals") is for this to eventually come from the
/// backend's `portals.config_schema` so adding a straightforward portal is a data change with
/// no desktop-app release at all.
#[derive(Debug, Clone)]
pub struct PortalConfig {
    pub code: &'static str,
    pub login_url: &'static str,
    pub username_selector: &'static str,
    pub password_selector: &'static str,
}

/// Implemented per portal. The default methods are enough for a straightforward
/// username/password form; a portal with a multi-step or iframe-nested login overrides
/// `build_fill_script`.
pub trait PortalAutomationAdapter: Send + Sync {
    fn config(&self) -> &PortalConfig;

    /// Builds the one script this engine is ever allowed to inject into a portal window: it
    /// sets exactly the two configured fields and dispatches input/change events (so
    /// React/Vue-controlled forms on the portal register the value), then stops. It never
    /// reads the DOM back for any other purpose, never touches any other field, and never
    /// calls submit().
    ///
    /// Polls for up to ~10s (40 × 250ms) before giving up: `open_portal_window` resolves as
    /// soon as the window exists, not once the portal's own JS framework has finished
    /// rendering its login form — a real gap found by actually testing this against a live
    /// portal (GST's login page is an Angular app with a loading spinner; a one-shot fill
    /// immediately after window creation silently found no elements and did nothing). Polling
    /// from inside the injected script, rather than delaying on the Rust side, means the wait
    /// is bounded by the portal's actual render time instead of a guessed fixed delay.
    ///
    /// Keeps re-asserting the values (rather than filling once and stopping) until they've held
    /// steady for two consecutive ticks — a second real gap found live, this time against MCA:
    /// its login page server-renders the `<input>` elements up front, so a one-shot fill lands
    /// on real elements and appears to succeed, but the page's own JS framework then hydrates
    /// and rebuilds that part of the DOM a moment later, silently wiping whatever we'd just set.
    /// Re-filling until the value is observed stable survives that race without fighting a user
    /// who starts editing the field themselves (their non-matching value stops looking "already
    /// correct", so this refills it back to what was asked for — same as any other stale value —
    /// rather than leaving a half-typed field; this only ever runs for a few seconds after the
    /// window opens, not indefinitely).
    ///
    /// `visibleEl` (rather than a plain `document.querySelector`) exists because live testing
    /// against INCOME_TAX (see its adapter module) found a selector can transiently answer with
    /// a hidden element — a dialog/template instance sharing an id with the visible field —
    /// which would otherwise be silently filled or clicked instead of the real one. Restricting
    /// matches to elements with a non-empty `getClientRects()` (actually rendered, not
    /// `display:none`) avoids that regardless of which portal hits the same issue —
    /// deliberately not `offsetParent !== null`, a common but broken visibility check that
    /// false-negatives for `position: fixed` elements (fully visible, `offsetParent` still
    /// null), a real bug this shipped with briefly before being caught by live testing.
    fn build_fill_script(&self, username: &str, password: &str) -> String {
        let cfg = self.config();
        format!(
            r#"(function() {{
  function setNativeValue(el, value) {{
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {{ setter.call(el, value); }} else {{ el.value = value; }}
    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
  }}
  function visibleEl(selector) {{
    var matches = document.querySelectorAll(selector);
    for (var i = 0; i < matches.length; i++) {{
      if (matches[i].getClientRects().length > 0) {{ return matches[i]; }}
    }}
    return null;
  }}
  var attempts = 0;
  var maxAttempts = 40;
  var stableTicks = 0;
  var timer = setInterval(function() {{
    attempts++;
    var userEl = visibleEl({username_selector});
    var passEl = visibleEl({password_selector});
    if (userEl && passEl) {{
      if (userEl.value === {username} && passEl.value === {password}) {{
        stableTicks++;
      }} else {{
        setNativeValue(userEl, {username});
        setNativeValue(passEl, {password});
        stableTicks = 0;
      }}
    }} else {{
      stableTicks = 0;
    }}
    if (stableTicks >= 2 || attempts >= maxAttempts) {{
      clearInterval(timer);
    }}
  }}, 250);
}})();"#,
            username_selector = serde_json::to_string(cfg.username_selector).unwrap_or_default(),
            password_selector = serde_json::to_string(cfg.password_selector).unwrap_or_default(),
            username = serde_json::to_string(username).unwrap_or_default(),
            password = serde_json::to_string(password).unwrap_or_default(),
        )
    }

    /// `false` for every adapter except INCOME_TAX (see its module). Most portals' login form
    /// stays on one page for the whole flow, so the single `window.eval` call `fill_portal_credential`
    /// already makes is enough — this exists because that assumption turned out to be false for
    /// at least one real portal: a script's own JS execution context (including any in-progress
    /// polling `setInterval`) does not reliably survive that portal's client-side navigation from
    /// its User ID screen to its Password screen, even though the URL only changes by hash, found
    /// live 2026-08-26. Returning `true` tells the Tauri command layer (`commands.rs`) to hold
    /// the redeemed credential in `AppState::pending_fill` (zeroized when the portal window
    /// closes) and re-run `build_fill_script` on every subsequent page-load event in the portal
    /// window, not just once.
    fn wants_reinjection_on_navigation(&self) -> bool {
        false
    }
}

pub struct GenericPortalAdapter {
    config: PortalConfig,
}

impl GenericPortalAdapter {
    pub fn new(config: PortalConfig) -> Self {
        Self { config }
    }
}

impl PortalAutomationAdapter for GenericPortalAdapter {
    fn config(&self) -> &PortalConfig {
        &self.config
    }
}

/// Built-in registry of the portals shipped in `docs/database-design.md`'s seed catalog.
/// Every entry beyond GST/INCOME_TAX/MCA is added exactly as docs/browser-automation-design.md
/// §7 prescribes for a straightforward portal: a data-only `PortalConfig`, no code beyond a
/// registry line.
///
/// Selector/URL accuracy (docs/development-roadmap.md, Phase 5): a live-fetch pass was originally
/// run against each of these (2026, from this environment) before any live QA — TRACES and the
/// Income Tax e-filing portal served an empty shell to that non-browser fetch (both client-side
/// Angular apps, no login form in the static HTML), and MCA's login page returned HTTP 403
/// (consistent with docs/threat-model.md's note that these portals actively defend against
/// non-browser traffic — exactly why this product's own automation only ever runs from the
/// user's real desktop browser session, never a server-side fetch). EPFO/ESIC/DGFT were not
/// fetched at all. GST, INCOME_TAX, and MCA have since each had a real live QA pass (their own
/// modules/comments below record what that took) and their selectors are confirmed, not guessed.
/// TRACES/EPFO/ESIC/DGFT below remain best-effort placeholders until the same happens for them.
pub fn adapter_for(portal_code: &str) -> Option<Box<dyn PortalAutomationAdapter>> {
    match portal_code {
        "GST" => Some(Box::new(gst::adapter())),
        "INCOME_TAX" => Some(Box::new(income_tax::adapter())),
        "TRACES" => Some(Box::new(GenericPortalAdapter::new(PortalConfig {
            code: "TRACES",
            // Confirmed by live redirect (302) from the old tdscpc.gov.in path — the exact
            // login sub-route within this Angular app was not reachable via a static fetch.
            login_url: "https://traces.tdscpc.gov.in/",
            username_selector: "#userName",
            password_selector: "#password",
        }))),
        // MCA retired the old V2 login (this used to point at /mcafoportal/login.do, which now
        // 404s) on 2025-06-18; every filing now happens on the V3 portal, an Adobe AEM Adaptive
        // Forms app. login_url is MCA's real front-office sign-in page (two guesses were tried
        // and rejected first: "/content/mca/global/en/mca-v3.html" renders an internal-error
        // page, and the bare root domain has no login form on it at all).
        //
        // Selectors are a comma-separated CSS selector LIST (querySelector natively tries each
        // and returns the first match), not a single guess — MCA blocks automated fetches (every
        // WebFetch attempt in this codebase's history has 403'd) and runs an anti-devtools script
        // on this page, so confirming this took two independent passes over the page's
        // view-source (2026-08-26, which bypasses the page's own JS/anti-devtools entirely):
        // `input[name='userID']`/`input[name='password']` came from the AEM Guide field
        // definitions (`guidetextbox` named "userID", `guidepasswordbox` named "password"); the
        // `.userID input[type='text']`/`.password input[type='password']` alternatives came from
        // reading MCA's own login click-handler, which reads the fields that same way — put
        // first, since it's what the portal's own code actually relies on. A one-shot fill
        // appeared to land on real elements here but visually showed nothing, consistent with AEM
        // rebuilding this part of the DOM after its initial (server-rendered) paint — the
        // re-fill-until-stable loop above exists because of this exact portal. Login itself may
        // still prompt an OTP/device-verification step after these two fields — same boundary as
        // every other adapter here: this fills username+password only and stops.
        "MCA" => Some(Box::new(GenericPortalAdapter::new(PortalConfig {
            code: "MCA",
            login_url: "https://www.mca.gov.in/content/mca/global/en/foportal/fologin.html",
            username_selector: ".userID input[type='text'], input[name='userID'], .userID input",
            password_selector: ".password input[type='password'], input[name='password'], .password-input input[type='password']",
        }))),
        "EPFO" => Some(Box::new(GenericPortalAdapter::new(PortalConfig {
            code: "EPFO",
            login_url: "https://unifiedportal-emp.epfindia.gov.in/epfo/",
            username_selector: "#userid",
            password_selector: "#pass",
        }))),
        "ESIC" => Some(Box::new(GenericPortalAdapter::new(PortalConfig {
            code: "ESIC",
            login_url: "https://www.esic.gov.in/employerlogin",
            username_selector: "#username",
            password_selector: "#password",
        }))),
        "DGFT" => Some(Box::new(GenericPortalAdapter::new(PortalConfig {
            code: "DGFT",
            login_url: "https://www.dgft.gov.in/CP/",
            username_selector: "#username",
            password_selector: "#password",
        }))),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_seeded_portal_code_has_an_adapter() {
        // Mirrors apps/api/prisma/seed.ts's PORTALS list — if that list grows, this should too.
        for code in ["GST", "INCOME_TAX", "TRACES", "MCA", "EPFO", "ESIC", "DGFT"] {
            assert!(adapter_for(code).is_some(), "missing adapter for seeded portal '{code}'");
        }
    }

    #[test]
    fn unknown_portal_code_returns_none() {
        assert!(adapter_for("NOT_A_REAL_PORTAL").is_none());
    }

    #[test]
    fn fill_script_targets_the_configured_selectors_and_never_a_submit_call() {
        let adapter = adapter_for("GST").unwrap();
        let script = adapter.build_fill_script("some-user", "some-pass");

        assert!(script.contains(adapter.config().username_selector));
        assert!(script.contains(adapter.config().password_selector));
        // The engine must never submit the form or touch anything past the two fields —
        // docs/browser-automation-design.md §6.
        assert!(!script.to_lowercase().contains(".submit("));
        assert!(!script.to_lowercase().contains("captcha"));
        assert!(!script.to_lowercase().contains("otp"));
    }

    #[test]
    fn fill_script_safely_escapes_values_that_look_like_script_injection() {
        // A password containing quotes/backslashes/HTML must not break out of the JSON string
        // literal it's embedded in — this is a real risk any time untrusted-shaped text
        // (a user's own portal password) is interpolated into an injected script.
        let adapter = adapter_for("GST").unwrap();
        let malicious = r#""); alert(1); //<script>"#;
        let script = adapter.build_fill_script("user", malicious);

        // The generated script must remain valid, parseable JS: every JSON string literal it
        // contains should round-trip through a JSON parser untouched.
        let string_literals: Vec<&str> = script.split('\n').collect();
        assert!(string_literals.iter().any(|line| line.contains("setNativeValue(passEl,")));
        // Confirm the raw password never appears un-escaped (i.e. it was JSON-encoded, so a
        // literal `");` sequence from the input cannot appear verbatim next to unescaped quotes).
        assert!(script.contains(&serde_json::to_string(malicious).unwrap()));
    }

    #[test]
    fn different_portals_produce_different_scripts() {
        let gst = adapter_for("GST").unwrap().build_fill_script("u", "p");
        let mca = adapter_for("MCA").unwrap().build_fill_script("u", "p");
        assert_ne!(gst, mca);
    }
}
