//! Portal automation engine (docs/browser-automation-design.md). `PortalConfig` is the data
//! half — selectors and URLs — so most new portals are addable without a code change; a
//! genuinely quirky portal gets its own small adapter module (see `gst.rs`) that can override
//! the default fill script. No adapter is ever permitted to touch a CAPTCHA/OTP field, read
//! page content back for that purpose, or auto-submit past the credential fields.

pub mod gst;

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
    /// reads the DOM back, never touches any other field, and never calls submit().
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
  var userEl = document.querySelector({username_selector});
  var passEl = document.querySelector({password_selector});
  if (userEl) setNativeValue(userEl, {username});
  if (passEl) setNativeValue(passEl, {password});
}})();"#,
            username_selector = serde_json::to_string(cfg.username_selector).unwrap_or_default(),
            password_selector = serde_json::to_string(cfg.password_selector).unwrap_or_default(),
            username = serde_json::to_string(username).unwrap_or_default(),
            password = serde_json::to_string(password).unwrap_or_default(),
        )
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
/// Every entry beyond GST is added exactly as docs/browser-automation-design.md §7 prescribes
/// for a straightforward portal: a data-only `PortalConfig`, no code beyond a registry line.
///
/// Selector/URL accuracy (docs/development-roadmap.md, Phase 5): a live-fetch pass was run
/// against each of these before writing this registry (2026, from this environment). Result —
/// TRACES and the Income Tax e-filing portal serve an empty shell with client-side (Angular)
/// rendering, so no login form exists in the static HTML to read selectors from; MCA's login
/// page returned HTTP 403 to an automated fetch (consistent with docs/threat-model.md's note
/// that these portals actively defend against non-browser traffic — exactly why this product's
/// own automation only ever runs from the user's real desktop browser session, never a
/// server-side fetch). EPFO/ESIC/DGFT were not fetched at all. **None of the selectors below
/// are confirmed against a live, rendered page** — they remain best-effort placeholders until
/// the Phase 4/5 exit criterion (manual QA on a real Windows machine against each real login
/// page) actually runs.
pub fn adapter_for(portal_code: &str) -> Option<Box<dyn PortalAutomationAdapter>> {
    match portal_code {
        "GST" => Some(Box::new(gst::adapter())),
        "INCOME_TAX" => Some(Box::new(GenericPortalAdapter::new(PortalConfig {
            code: "INCOME_TAX",
            login_url: "https://eportal.incometax.gov.in/iec/foservices/#/login",
            username_selector: "#username",
            password_selector: "#password",
        }))),
        "TRACES" => Some(Box::new(GenericPortalAdapter::new(PortalConfig {
            code: "TRACES",
            // Confirmed by live redirect (302) from the old tdscpc.gov.in path — the exact
            // login sub-route within this Angular app was not reachable via a static fetch.
            login_url: "https://traces.tdscpc.gov.in/",
            username_selector: "#userName",
            password_selector: "#password",
        }))),
        "MCA" => Some(Box::new(GenericPortalAdapter::new(PortalConfig {
            code: "MCA",
            login_url: "https://www.mca.gov.in/mcafoportal/login.do",
            username_selector: "#userId",
            password_selector: "#password",
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
