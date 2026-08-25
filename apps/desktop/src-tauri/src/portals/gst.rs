//! GST portal adapter (docs/browser-automation-design.md §7 — "Adding a New Portal").
//! Isolated in its own module per the codebase rule that portal selectors never scatter
//! through generic code. Today it only needs the default fill script from
//! `PortalAutomationAdapter`, but it is a distinct type (not just a registry entry) so a
//! future GST-specific quirk (e.g. an iframe-nested login form) has an obvious, single place
//! to land without touching the generic engine.
//!
//! Selector values below are best-effort placeholders — NOT verified against the live
//! gst.gov.in login page from this environment (no network access to browse it here). Manual
//! QA against the real portal is required before this adapter is trusted in production
//! (docs/development-roadmap.md, Phase 4 exit criteria).

use super::{PortalAutomationAdapter, PortalConfig};

pub struct GstPortalAdapter {
    config: PortalConfig,
}

impl PortalAutomationAdapter for GstPortalAdapter {
    fn config(&self) -> &PortalConfig {
        &self.config
    }
}

pub fn adapter() -> GstPortalAdapter {
    GstPortalAdapter {
        config: PortalConfig {
            code: "GST",
            login_url: "https://services.gst.gov.in/services/login",
            username_selector: "#username",
            password_selector: "#user_pass",
        },
    }
}
