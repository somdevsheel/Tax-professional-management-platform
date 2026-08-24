# Desktop Application Architecture (Windows)

## 1. Stack

Tauri 2 (Rust core) + React + TypeScript frontend, WebView2 (Microsoft Edge runtime, present
by default on Windows 10 21H2+/11) as the embedded browser engine for both the app UI shell
rendering and — separately — the portal-automation browser window. See
[browser-automation-design.md](browser-automation-design.md) for why WebView2 was chosen over
Playwright/system-browser/extension approaches for the automation piece specifically.

## 2. Process Model

```mermaid
flowchart TB
    subgraph Tauri Process (Rust)
        Core[Tauri Core]
        Secure[Secure Storage Module - DPAPI/Credential Manager]
        Http[HTTPS API Client]
        Auto[Portal Automation Engine]
    end
    subgraph WebView2 - App UI
        UI[React App - client list, tasks, dashboard]
    end
    subgraph WebView2 - Portal Window (separate, isolated)
        Portal[Government/Business Portal Page]
    end

    UI <-->|Tauri IPC, typed commands| Core
    Core --> Secure
    Core --> Http --> API[Backend API]
    Core --> Auto
    Auto -->|drives, autofill only| Portal
```

Key isolation decision: the **app UI WebView** (rendering the React dashboard) and the
**portal automation WebView** (rendering e.g. gst.gov.in) are separate WebView2 environments/
windows. The portal page never has access to Tauri IPC, the app's JS context, or any secret
beyond the one username/password pair injected for that single autofill call. This prevents a
compromised or malicious portal page from reaching into the app.

## 3. Why Business Logic Stays Server-Side

The desktop app is a thin client: all authorization decisions, encryption/decryption of
credentials, and audit logging happen on the backend. The desktop's Rust core only:

- Authenticates the user and stores tokens securely.
- Calls the API (same contracts as web) to fetch/mutate data.
- Requests a one-time portal-session credential token, receives plaintext transiently, and
  performs the autofill — then immediately zeroizes that memory.
- Drives the automation state machine (open → navigate → fill → wait-for-user → detect-completion).

This means a future mobile app or a second desktop rewrite never has to reimplement
encryption, RBAC, or audit rules — those live once, on the server.

## 4. Local Secure Storage

| Data | Storage | Mechanism |
|---|---|---|
| Refresh token | Windows Credential Manager | `windows` crate `CredWrite`/`CredRead`, DPAPI-backed, per-OS-user |
| Cached non-sensitive client list (for fast search/offline glance) | Local SQLite (Tauri `sql` plugin) | No secrets stored here; purely a read cache, refreshed on sync, wiped on logout |
| App preferences (theme, recent clients, shortcuts) | Local SQLite / Tauri store | Non-sensitive |
| Decrypted portal credential | **Process memory only**, zeroized after use (`zeroize` crate) | Never written to disk, never in the SQLite cache, never logged |

## 5. Session & Lock Behavior

- On login, access token kept in memory only; refresh token in Credential Manager.
- Configurable idle timeout (default 15 min) locks the UI (dims + requires re-auth) without
  fully logging out — refresh token stays valid, just gated behind a local unlock.
- Full logout revokes the session server-side (`POST /auth/logout`) and clears Credential
  Manager entry and local SQLite cache.
- Step-up re-authentication (password re-entry) required before: revealing a credential,
  bulk-exporting data, or changing security-relevant settings.

## 6. UX Structure

```
Login screen
  -> Organization picker (if multi-firm membership)
    -> Main shell
       - Left rail: Dashboard, Clients, Tasks, Compliance, Documents, Activity, Settings
       - Top bar: global search (Ctrl+K), quick client switcher, notifications bell
       - Client dashboard: Overview / GST / Income Tax / TDS / MCA / Documents / Tasks / Activity / Credentials tabs
         each portal tab: [Open Portal] [Manage Credential] with last-used/status indicators
```

- `Ctrl+K`: command palette — "Search client, GSTIN, PAN, task...", also supports quick
  actions ("New task for ABC Pvt Ltd").
- Recent clients + favorites persisted locally (SQLite), synced as a `settings` blob to the
  backend so they follow the user across machines.
- System tray icon: shows notification badge, quick-access menu (recent clients, new task),
  minimizes-to-tray option.
- Native Windows notifications (Tauri notification plugin) for task due-soon, credential
  needs-review, deadline alerts pushed from the backend over a WebSocket/SSE channel.

## 7. Update & Distribution

- Signed installer (Authenticode certificate), built via `tauri-action` CI pipeline, separate
  from the web/API CI pipeline (different artifact, different release cadence).
- Auto-update via `tauri-plugin-updater` against a signed update manifest hosted alongside
  releases; update payloads are signature-verified before install (minisign/Ed25519 keypair
  held outside the repo).
- `minimumDesktopVersion` check against `/auth/me` response blocks stale clients from
  operations that require a newer contract, prompting an update instead of failing opaquely.

## 8. Error & Offline Handling

API calls fail closed: if the backend is unreachable, the app shows a clear "offline" banner
and disables write actions (task creation still queues locally with a sync indicator; anything
credential/portal-related is fully blocked offline since it requires a live authorized
session — no locally cached plaintext ever exists to fall back on).
