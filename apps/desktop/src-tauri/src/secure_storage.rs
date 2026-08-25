//! OS-native secure storage for the refresh token: Windows Credential Manager (DPAPI-backed)
//! on Windows, Secret Service/libsecret on Linux, Keychain on macOS — via the `keyring` crate
//! rather than hand-rolled per-OS bindings (docs/desktop-architecture.md §4,
//! docs/security-design.md §10). Never a plaintext file on disk.

use keyring::Entry;

const SERVICE: &str = "com.taxplatform.desktop";
const REFRESH_TOKEN_KEY: &str = "refresh_token";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, REFRESH_TOKEN_KEY).map_err(|e| format!("secure storage unavailable: {e}"))
}

pub fn get_refresh_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("failed to read refresh token: {e}")),
    }
}

pub fn set_refresh_token(token: &str) -> Result<(), String> {
    entry()?
        .set_password(token)
        .map_err(|e| format!("failed to store refresh token: {e}"))
}

pub fn clear_refresh_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("failed to clear refresh token: {e}")),
    }
}
