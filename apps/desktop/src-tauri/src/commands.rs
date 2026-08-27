//! Tauri commands invoked from the React frontend. Everything credential-related here follows
//! docs/security-design.md §6 and §10: plaintext is decrypted in Rust, handed straight to the
//! isolated portal window via a fixed fill script, and dropped (zeroized) immediately after —
//! it is never returned to the app's own JS/React context.

use tauri::{webview::PageLoadEvent, AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};
use crate::portals::adapter_for;
use crate::secure_storage;
use crate::state::{AppState, PendingFill};

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
pub fn open_portal_window(app: AppHandle, state: State<'_, AppState>, portal_code: String) -> AppResult<()> {
    let adapter = adapter_for(&portal_code)
        .ok_or_else(|| AppError::Automation(format!("No automation adapter registered for portal '{portal_code}'")))?;

    if let Some(existing) = app.get_webview_window(PORTAL_WINDOW_LABEL) {
        let _ = existing.close();
    }

    // Whatever a previous portal session left behind (e.g. the window was closed via its native
    // titlebar button rather than the close_portal_window command, which is the only other place
    // this gets cleared) must not bleed into this new one.
    if let Ok(mut pending_guard) = state.pending_fill.lock() {
        *pending_guard = None;
    }

    let url = adapter
        .config()
        .login_url
        .parse()
        .map_err(|e| AppError::Automation(format!("invalid portal login URL: {e}")))?;

    // For most portals this handler never does anything (their adapter's
    // `wants_reinjection_on_navigation()` is false, so it returns immediately below). It's a
    // defensive fallback for a multi-screen portal (INCOME_TAX) in case some navigation within
    // it ever *does* trigger a real page load rather than the in-app hash routing its "Continue"
    // click normally causes — live debugging (2026-08-26, see `portals::income_tax`'s module
    // comment) found `PageLoadEvent::Finished` does not actually fire for that hash navigation,
    // so the real fix ended up being making the adapter's own polling script re-check which
    // screen it's on inside every tick rather than once at start-up. This stays in place as
    // cheap insurance rather than because it's load-bearing today: if it ever does fire, it
    // re-runs `build_fill_script` fresh using whatever credential `fill_portal_credential`
    // stashed in `AppState::pending_fill`.
    let app_for_page_load = app.clone();
    let portal_code_for_page_load = portal_code.clone();

    WebviewWindowBuilder::new(&app, PORTAL_WINDOW_LABEL, WebviewUrl::External(url))
        .title(format!("{} — sign in", adapter.config().code))
        .inner_size(1100.0, 800.0)
        .on_page_load(move |window, payload| {
            if !matches!(payload.event(), PageLoadEvent::Finished) {
                return;
            }
            let Some(state) = app_for_page_load.try_state::<AppState>() else {
                return;
            };
            let Ok(pending_guard) = state.pending_fill.lock() else {
                return;
            };
            let Some(pending) = pending_guard.as_ref() else {
                return;
            };
            if pending.portal_code != portal_code_for_page_load {
                return;
            }
            let Some(adapter) = adapter_for(&portal_code_for_page_load) else {
                return;
            };
            if !adapter.wants_reinjection_on_navigation() {
                return;
            }
            let script = adapter.build_fill_script(&pending.credential.username, &pending.credential.password);
            let _ = window.eval(&script);
        })
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

    // Plaintext lives only in this local binding for most portals; ZeroizeOnDrop wipes it as
    // soon as it goes out of scope, including on the early-return error paths below. The one
    // exception (adapter.wants_reinjection_on_navigation() == true) moves it into
    // AppState::pending_fill below instead, where it's zeroized on window close or replacement
    // rather than at the end of this function — see portals::income_tax's module comment for why.
    let credential = state
        .backend
        .redeem_portal_session_credential(&session_id, &one_time_token)
        .await?;

    let script = adapter.build_fill_script(&credential.username, &credential.password);
    window
        .eval(&script)
        .map_err(|e| AppError::Automation(format!("failed to fill credential fields: {e}")))?;

    if adapter.wants_reinjection_on_navigation() {
        if let Ok(mut pending_guard) = state.pending_fill.lock() {
            *pending_guard = Some(PendingFill { portal_code, credential });
        }
    }

    // Tell the main app window to show "complete CAPTCHA/OTP to continue" — the automation
    // engine's job ends here; everything past this point is the human's.
    app.emit("portal-automation://awaiting-challenge", &session_id)
        .map_err(|e| AppError::Automation(format!("failed to notify UI: {e}")))?;

    Ok(())
}

#[tauri::command]
pub fn close_portal_window(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    // Drops (and so zeroizes) anything fill_portal_credential stashed in pending_fill for a
    // multi-screen portal — this is the credential's only remaining owner once the window that
    // needed it closes.
    if let Ok(mut pending_guard) = state.pending_fill.lock() {
        *pending_guard = None;
    }
    if let Some(window) = app.get_webview_window(PORTAL_WINDOW_LABEL) {
        window
            .close()
            .map_err(|e| AppError::Automation(format!("failed to close portal window: {e}")))?;
    }
    Ok(())
}
