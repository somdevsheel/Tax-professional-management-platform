mod api;
mod commands;
mod error;
mod portals;
mod secure_storage;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Backend base URL: overridable per environment, never hard-coded into a shipped binary as
    // a secret (there is nothing secret here — it's a public API endpoint — but it does need
    // to differ between dev/staging/prod builds, see docs/desktop-architecture.md §7).
    let api_base_url =
        std::env::var("TAX_PLATFORM_API_URL").unwrap_or_else(|_| "http://localhost:4000".to_string());

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new(api_base_url))
        .invoke_handler(tauri::generate_handler![
            commands::get_refresh_token,
            commands::set_refresh_token,
            commands::clear_refresh_token,
            commands::open_portal_window,
            commands::fill_portal_credential,
            commands::close_portal_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}
