//! Tauri commands invoked from the React frontend. Everything credential-related here follows
//! docs/security-design.md §6 and §10: plaintext is decrypted in Rust, handed straight to the
//! isolated portal window via a fixed fill script, and dropped (zeroized) immediately after —
//! it is never returned to the app's own JS/React context.

use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};
use crate::portals::adapter_for;
use crate::secure_storage;
use crate::state::AppState;

const PORTAL_WINDOW_LABEL: &str = "portal-automation";

#[tauri::command]
pub fn get_refresh_token() -> AppResult<Option<String>> {
    secure_storage::get_refresh_token().map_err(AppError::SecureStorage)
}

#[tauri::command]
pub fn set_refresh_token(token: String) -> AppResult<()> {
    secure_storage::set_refresh_token(&token).map_err(AppError::SecureStorage)
}

#[tauri::command]
pub fn clear_refresh_token() -> AppResult<()> {
    secure_storage::clear_refresh_token().map_err(AppError::SecureStorage)
}

/// Step 1 of the portal-login workflow (docs/system-design.md §4): open the portal's own login
/// page in an isolated window — separate from the app's UI window, with no Tauri IPC bridge,
/// per docs/desktop-architecture.md §2. Username/password are not filled yet.
#[tauri::command]
pub fn open_portal_window(app: AppHandle, portal_code: String) -> AppResult<()> {
    let adapter = adapter_for(&portal_code)
        .ok_or_else(|| AppError::Automation(format!("No automation adapter registered for portal '{portal_code}'")))?;

    if let Some(existing) = app.get_webview_window(PORTAL_WINDOW_LABEL) {
        let _ = existing.close();
    }

    let url = adapter
        .config()
        .login_url
        .parse()
        .map_err(|e| AppError::Automation(format!("invalid portal login URL: {e}")))?;

    WebviewWindowBuilder::new(&app, PORTAL_WINDOW_LABEL, WebviewUrl::External(url))
        .title(format!("{} — sign in", adapter.config().code))
        .inner_size(1100.0, 800.0)
        .build()
        .map_err(|e| AppError::Automation(format!("failed to open portal window: {e}")))?;

    Ok(())
}

/// Step 2: redeem the portal-session's one-time token for the transient plaintext credential
/// (Rust-only — see docs/api.rs comment) and fill exactly the configured username/password
/// fields in the already-open portal window. Never fills, reads, or interacts with anything
/// else — CAPTCHA/OTP/MFA are left entirely to the human
/// (docs/browser-automation-design.md §6).
#[tauri::command]
pub async fn fill_portal_credential(
    app: AppHandle,
    state: State<'_, AppState>,
    portal_code: String,
    session_id: String,
    one_time_token: String,
) -> AppResult<()> {
    let adapter = adapter_for(&portal_code)
        .ok_or_else(|| AppError::Automation(format!("No automation adapter registered for portal '{portal_code}'")))?;

    let window = app
        .get_webview_window(PORTAL_WINDOW_LABEL)
        .ok_or_else(|| AppError::Automation("Portal window is not open".to_string()))?;

    // Plaintext lives only in this local binding; ZeroizeOnDrop wipes it as soon as it goes
    // out of scope, including on the early-return error paths below.
    let credential = state
        .backend
        .redeem_portal_session_credential(&session_id, &one_time_token)
        .await?;

    let script = adapter.build_fill_script(&credential.username, &credential.password);
    window
        .eval(&script)
        .map_err(|e| AppError::Automation(format!("failed to fill credential fields: {e}")))?;

    // Tell the main app window to show "complete CAPTCHA/OTP to continue" — the automation
    // engine's job ends here; everything past this point is the human's.
    app.emit("portal-automation://awaiting-challenge", &session_id)
        .map_err(|e| AppError::Automation(format!("failed to notify UI: {e}")))?;

    Ok(())
}

#[tauri::command]
pub fn close_portal_window(app: AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(PORTAL_WINDOW_LABEL) {
        window
            .close()
            .map_err(|e| AppError::Automation(format!("failed to close portal window: {e}")))?;
    }
    Ok(())
}
