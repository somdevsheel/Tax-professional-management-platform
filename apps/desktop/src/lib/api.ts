import { invoke } from "@tauri-apps/api/core";
import { ApiClient } from "@tax-platform/api-client";

// Same backend base URL the Rust side uses by default; override via VITE_API_URL at build
// time for staging/prod desktop builds (docs/desktop-architecture.md §7).
const API_ROOT = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const apiClient = new ApiClient({
  baseUrl: `${API_ROOT}/api/v1`,
  platform: "desktop",
  onSessionExpired: () => {
    window.location.hash = "#/login";
  },
  // Keeps OS-native secure storage in sync even for a silent refresh triggered transparently
  // by a 401 retry, not just explicit login/logout call sites.
  onRefreshTokenRotated: (token) => {
    void persistRefreshToken(token);
  },
});

// The refresh token itself never touches localStorage/sessionStorage — it's read from and
// written to OS-native secure storage (Windows Credential Manager/DPAPI via the `keyring`
// crate) through these two Tauri commands (docs/security-design.md §2, §10).
export async function loadStoredRefreshToken(): Promise<string | null> {
  return invoke<string | null>("get_refresh_token");
}

export async function persistRefreshToken(token: string): Promise<void> {
  await invoke("set_refresh_token", { token });
}

export async function clearStoredRefreshToken(): Promise<void> {
  await invoke("clear_refresh_token");
}
