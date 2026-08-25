# Desktop App (Tauri)

Windows desktop client — see [docs/desktop-architecture.md](../../docs/desktop-architecture.md)
and [docs/browser-automation-design.md](../../docs/browser-automation-design.md) for the design.

## Layout

```
src/              React + TypeScript UI (Vite) — auth, client list/detail, portal launcher
src-tauri/        Rust core
  src/
    commands.rs       Tauri commands the frontend invokes
    secure_storage.rs OS-native credential storage (keyring crate — Credential Manager/DPAPI
                       on Windows, Secret Service on Linux, Keychain on macOS)
    api.rs            The one backend call that must never enter the app's JS context: redeeming
                       a portal-session's one-time credential token
    portals/          PortalAutomationAdapter trait + per-portal config/adapters
```

Everything else (client CRUD, portal accounts, credential metadata, portal-session
create/events) is a normal authenticated REST call the React frontend makes directly with
`@tax-platform/api-client`, exactly like the web app — no business logic duplicated here.

## Portal coverage

`portals::adapter_for()` covers every portal in the backend's seed catalog: GST, Income Tax,
TRACES, MCA, EPFO, ESIC, DGFT. All but GST are plain `PortalConfig` data entries (no code),
per docs/browser-automation-design.md §7's "adding a portal is a data change" design. **None
of the selectors are confirmed against a live, rendered page** — TRACES and the Income Tax
e-filing portal are client-rendered Angular apps with no login form in their static HTML, and
MCA's login page returns HTTP 403 to a non-browser fetch (both discovered by actually trying,
not assumed — see the comment above `adapter_for`). Manual QA against each real portal, on a
real Windows machine, is required before any adapter is trusted — tracked in
docs/development-roadmap.md, Phase 5, not skipped silently.

## Testing

```bash
cd src-tauri && cargo test
```

Covers the fill-script builder: correct selectors targeted, no `.submit()`/CAPTCHA/OTP
handling ever generated, and — the one with real teeth — a portal password containing quote/
script-injection-shaped characters stays safely JSON-escaped inside the injected script rather
than breaking out of the string literal.

## Building on Windows (the actual target platform)

Standard Tauri prerequisites apply: Rust (rustup), Visual Studio Build Tools with the C++
workload, and WebView2 (preinstalled on Windows 10 21H2+/11). Then:

```bash
pnpm install
pnpm --filter @tax-platform/types build
pnpm --filter @tax-platform/api-client build
cd apps/desktop
pnpm tauri:dev      # or pnpm tauri:build for a release installer
```

## Building on Linux (for development/CI without a Windows machine)

Tauri uses WebKitGTK on Linux instead of WebView2. **This project targets WebKitGTK ≥ 2.40**
(what current `tauri` crates require); Ubuntu 22.04's default repos only ship 2.36. If your
distro's repos are also behind, either use a newer distro/repo, or pull the newer package from
`jammy-updates` explicitly:

```bash
sudo apt-get install -y --no-install-recommends \
  libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev libxdo-dev \
  patchelf build-essential curl file
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Then the same `pnpm tauri:dev` / `pnpm tauri:build` as above.

> **Known gap, disclosed rather than hidden:** this app was built and verified in a sandboxed
> environment with no `sudo` access, so the WebKitGTK dev packages were obtained by
> downloading `.deb` files directly (`apt-get download`, no root needed) into a local sysroot
> instead of a real system install. `cargo check` / `cargo build` / `cargo clippy` all pass
> cleanly against it, and the compiled binary launches, initializes Tauri/GTK, and creates its
> window without crashing — but WebKitGTK spawns its actual page-rendering process
> (`WebKitWebProcess`) from a path baked into the library at its own build time, which pointed
> at the *system's* older, mismatched helper binary rather than the sysroot's matching one,
> so full interactive rendering was never visually confirmed in that environment. This is an
> artifact of that specific no-root workaround — it does not occur with a normal
> `apt install`/root setup, and has no bearing on the real Windows/WebView2 target, which uses
> an entirely different, evergreen-updated engine with no such version conflict. A real `sudo
> apt-get install` (command above) or a genuine Windows build does not hit this.
