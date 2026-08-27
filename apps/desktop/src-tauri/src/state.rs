use std::sync::Mutex;

use crate::api::{BackendClient, CredentialPlaintext};

/// Held only for portals whose adapter sets `wants_reinjection_on_navigation()` — see that
/// trait method's doc comment in `portals/mod.rs` for why a redeemed credential needs to survive
/// past the first `window.eval` call at all. `credential` reuses `CredentialPlaintext`'s existing
/// `Zeroize`/`ZeroizeOnDrop`, so replacing or clearing this `Option` (portal window closed, a new
/// portal opened) wipes the plaintext the same way the original one-shot local binding did.
pub struct PendingFill {
    pub portal_code: String,
    pub credential: CredentialPlaintext,
}

pub struct AppState {
    pub backend: BackendClient,
    pub pending_fill: Mutex<Option<PendingFill>>,
}

impl AppState {
    pub fn new(base_url: String) -> Self {
        Self {
            backend: BackendClient::new(base_url),
            pending_fill: Mutex::new(None),
        }
    }
}
