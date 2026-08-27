//! Income Tax e-filing portal adapter (docs/browser-automation-design.md §7).
//!
//! Confirmed live 2026-08-26 against the real `eportal.incometax.gov.in/iec/foservices` login —
//! not a guess. Unlike every other portal in this registry, login here is a genuine two-step
//! wizard: a User ID screen with its own "Continue" button navigates (client-side routing, no
//! full page reload — `#/login` to `#/login/password`) to a separate Password screen. The
//! password `<input>` does not exist in the DOM at all until that navigation happens.
//!
//! Two overrides were needed, not one, both found by actually running this live rather than
//! reasoned out in advance:
//!
//! 1. `build_fill_script` — the generic single-screen fill (the trait default, which fills both
//!    configured selectors at once) can't reach a password field that doesn't exist yet. This
//!    adapter's script instead looks at `location.href` and fills only whichever field belongs to
//!    the *current* screen (username + click Continue if not yet on `/login/password`, password
//!    if already there) — deliberately stateless (no "phase" variable persisted across polling
//!    ticks), because a stateful version was tried first and turned out not to work: this
//!    portal's navigation from the User ID screen to the Password screen does not reliably
//!    preserve a running script's JS execution context (its `setInterval` and any variables it
//!    closed over), even though the URL only changes by hash. A script that assumed it would
//!    keep running across that navigation filled User ID but then simply never ran again.
//!
//! 2. `wants_reinjection_on_navigation` — since nothing can be assumed to survive that
//!    navigation, something has to inject a *fresh* copy of this same script after it happens.
//!    Returning `true` here makes `apps/desktop/src-tauri/src/commands.rs` hold the redeemed
//!    credential in `AppState::pending_fill` and re-run `build_fill_script` on every subsequent
//!    page-load event in the portal window (not just the one immediate call
//!    `fill_portal_credential` already makes) — each fresh injection independently figures out
//!    "which screen am I on" from the URL and does the right thing, so it doesn't matter that no
//!    state carried over from the previous injection.
//!
//! The password screen also carries a mandatory "secure access message" checkbox (confirm you
//! recognise the personalised phrase/image shown, an anti-phishing check) — this adapter never
//! touches it, exactly like it never touches CAPTCHA/OTP elsewhere: that confirmation only means
//! something if a human actually looked at it.
//!
//! Selectors were confirmed via live DevTools (Elements panel + Console) against the real
//! rendered Angular app, the same way GST's were — real ids read off the live page, not inferred
//! from static HTML (this portal serves an empty shell to a non-browser fetch, so that wasn't an
//! option here). The username selector matches two spellings — "panAadhaarUserId" and
//! "panAdhaarUserId" (one fewer "a") — both captured live in independent sessions; this field's
//! own id is apparently inconsistent between renders/deploys on the portal's side, not a typo
//! here, so both are matched rather than picking one.
//!
//! `visibleEl` (rather than a plain `document.querySelector`) exists because live testing found
//! this exact page can answer a lookup with an element that isn't the one on screen —
//! `#continueBtnNav` was once read back mid-poll with the text "Confirm" while the visible button
//! still said "Continue", implying a second, hidden element (a dialog/template instance) can
//! transiently share the same id. Restricting matches to elements with a non-empty
//! `getClientRects()` (actually rendered, not `display:none`) avoids ever reading from or
//! clicking that hidden double — deliberately not `offsetParent !== null`, a common but broken
//! visibility check that false-negatives for `position: fixed` elements (fully visible,
//! `offsetParent` still null), a real bug this adapter shipped with briefly before being caught
//! by live testing.

use super::{PortalAutomationAdapter, PortalConfig};

const CONTINUE_BUTTON_SELECTOR: &str = "#continueBtnNav";
const PASSWORD_SCREEN_URL_MARKER: &str = "/login/password";

pub struct IncomeTaxPortalAdapter {
    config: PortalConfig,
}

impl PortalAutomationAdapter for IncomeTaxPortalAdapter {
    fn config(&self) -> &PortalConfig {
        &self.config
    }

    fn wants_reinjection_on_navigation(&self) -> bool {
        true
    }

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
  var maxAttempts = 100;
  var stableTicks = 0;
  var clickedContinue = false;
  var timer = setInterval(function() {{
    attempts++;
    // Re-checked fresh on every tick, not cached once at script start — this same setInterval
    // keeps running across the click-triggered hash navigation (confirmed live: on_page_load
    // never re-fires for it, so nothing re-injects this script; it doesn't need to), so which
    // screen is current can and does change out from under it mid-run.
    var onPasswordScreen = location.href.indexOf({password_screen_marker}) !== -1;
    if (onPasswordScreen) {{
      var passEl = visibleEl({password_selector});
      if (passEl) {{
        if (passEl.value === {password}) {{
          stableTicks++;
        }} else {{
          setNativeValue(passEl, {password});
          stableTicks = 0;
        }}
      }} else {{
        stableTicks = 0;
      }}
    }} else {{
      var userEl = visibleEl({username_selector});
      if (userEl) {{
        if (userEl.value === {username}) {{
          stableTicks++;
        }} else {{
          setNativeValue(userEl, {username});
          stableTicks = 0;
        }}
        if (stableTicks >= 2 && !clickedContinue) {{
          var btn = visibleEl({continue_selector});
          if (btn && !btn.disabled) {{
            btn.click();
            clickedContinue = true;
            stableTicks = 0;
          }}
        }}
      }} else {{
        stableTicks = 0;
      }}
    }}
    // Only a stable *password* counts as done — not a stable username, even after clicking
    // Continue: if the navigation to the password screen lags behind the click by more than a
    // couple of ticks, the still-filled username field would otherwise re-accumulate
    // stableTicks on its own and trigger this same check before the run ever reaches the
    // screen it actually needs to fill.
    if ((onPasswordScreen && stableTicks >= 2) || attempts >= maxAttempts) {{
      clearInterval(timer);
    }}
  }}, 250);
}})();"#,
            password_screen_marker = serde_json::to_string(PASSWORD_SCREEN_URL_MARKER).unwrap_or_default(),
            username_selector = serde_json::to_string(cfg.username_selector).unwrap_or_default(),
            password_selector = serde_json::to_string(cfg.password_selector).unwrap_or_default(),
            continue_selector = serde_json::to_string(CONTINUE_BUTTON_SELECTOR).unwrap_or_default(),
            username = serde_json::to_string(username).unwrap_or_default(),
            password = serde_json::to_string(password).unwrap_or_default(),
        )
    }
}

pub fn adapter() -> IncomeTaxPortalAdapter {
    IncomeTaxPortalAdapter {
        config: PortalConfig {
            code: "INCOME_TAX",
            login_url: "https://eportal.incometax.gov.in/iec/foservices/#/login",
            username_selector: "#panAadhaarUserId, #panAdhaarUserId, input[name='panAadhaarUserId'], input[name='panAdhaarUserId']",
            password_selector: "#loginPasswordField",
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fill_script_targets_both_screens_and_never_touches_the_secure_access_checkbox() {
        let adapter = adapter();
        let script = adapter.build_fill_script("PAN123", "s3cret");
        assert!(script.contains("panAadhaarUserId"));
        assert!(script.contains("continueBtnNav"));
        assert!(script.contains("loginPasswordField"));
        assert!(script.contains("login/password"));
        assert!(!script.contains("passwordCheckbox"));
        assert!(!script.to_lowercase().contains(".submit("));
        assert!(!script.to_lowercase().contains("captcha"));
        assert!(!script.to_lowercase().contains("otp"));
    }

    #[test]
    fn wants_reinjection_on_navigation_is_true() {
        assert!(adapter().wants_reinjection_on_navigation());
    }
}
