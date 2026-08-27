# Development Roadmap

Work proceeds phase by phase; each phase ends with tests passing, type-check clean, lint
clean, and docs updated before the next phase starts (per the project's development-process
rule — no large untested drops of code).

## Phase 1 — Foundation
- Monorepo scaffold (pnpm workspaces, shared config packages).
- System design docs (this set) — **done**.
- Backend foundation: NestJS app skeleton, Prisma schema for core tables, Postgres/Redis via
  Docker Compose.
- Authentication: register/login/refresh/logout, Argon2id, JWT + rotating refresh tokens.
- Multi-tenancy: organizations, organization_members, tenant-scope guard + RLS.
- RBAC: roles/permissions tables, seed system roles, PermissionsGuard.
- Exit criteria: a user can register a firm, log in, get scoped tokens; tenant isolation and
  RBAC integration tests passing.

## Phase 2 — Core Domain — done
- Client management module: CRUD, contacts, assignments, search/filter (`clients/`).
- Portal catalog (seeded, global) + portal_accounts under a client (`portals/`).
- Credential vault: envelope encryption (`CredentialCryptoService`, per-credential DEK wrapped
  by a pluggable `KeyManagementProvider` — `LocalKmsProvider` for dev, production provider is
  the documented extension point), full CRUD, step-up-gated reveal, rotation
  (`credentials/`).
- Portal-session issuance: `POST /portal-sessions` → one-time token → `GET
  /portal-sessions/:id/credential` → transient plaintext handoff, matching the
  "[Open GST Portal]" workflow in docs/system-design.md §4 (`portal-sessions/`).
- Audit coverage extended: CLIENT_*, CREDENTIAL_*, PORTAL_* events, all metadata-only.
- Exit criteria met: encryption round-trip + tamper/wrong-key detection tested; credential
  access (create/view/rotate/reveal/use) fully audited; cross-tenant access to clients and
  credentials proven blocked by integration tests; one-time portal-session token proven
  single-use.

Deferred from the original Phase 2 sketch (tracked, not silently dropped): Postgres
row-level-security policies as defense-in-depth (docs/security-design.md §3 point 3) — this
needs a separate least-privilege application DB role to be meaningful (RLS is a no-op for a
table-owning role), which is a deployment-configuration concern better done alongside Phase 6
hardening than half-implemented now. Document upload/task/compliance application code remains
Phase 3 as originally planned.

## Phase 3 — Web Application — done (scoped to what Phase 1–2 backend supports)
- `packages/api-client`: typed `ApiClient` (auth token lifecycle, silent-refresh-and-retry,
  every Phase 1–2 endpoint) — written to be shared with the desktop app later, not web-only.
- Next.js (App Router) app: auth flow (login/register, in-memory access token, silent refresh
  off the httpOnly cookie on load), dashboard shell (sidebar/topbar, org switcher for
  multi-firm users), client list/detail/create with search+filter, portal catalog, and the
  full credential management UI on a client's page — add/rotate/delete, plus **reveal** behind
  a step-up password modal that auto-hides plaintext after 30s and is never cached by
  React Query. Employees (list/invite/role) and Activity (audit log, filterable) pages.
- Deliberately **not** built: Tasks/Compliance/Documents/Reports pages are present in the nav
  as clearly-labeled "coming soon" placeholders rather than left broken or omitted — their
  backend service layer doesn't exist yet (schema does), so building real UI against them
  would be UI for endpoints that don't exist. They land when their backend module does.
- Exit criteria met: `pnpm typecheck` / `pnpm lint` / `pnpm build` all clean; the full
  register → create client → add portal → store credential → reveal (step-up) flow verified
  against the running Phase 1–2 API. Not yet covered: automated browser/e2e tests for the web
  app itself (no headless-browser tooling was available in this environment to add Playwright
  runs) — a real gap, tracked for Phase 6 alongside the rest of the testing strategy below.

## Phase 4 — Windows Desktop Application — built, compile-verified; visual/interactive QA still pending
- Tauri (Rust + React) shell: secure desktop auth (refresh token in OS-native secure storage
  via the `keyring` crate — Credential Manager/DPAPI on Windows), client list/detail.
- Portal launcher: `PortalAutomationAdapter` trait, a config-driven registry (GST, Income Tax,
  TRACES, MCA), and the open→fill→await-challenge→continue flow wired end to end against the
  Phase 2 portal-session API — the credential's plaintext is redeemed and used entirely in
  Rust and never crosses into the app's own JS/React context.
- What's verified: `cargo check` / `cargo build` / `cargo clippy` all pass cleanly against
  real WebKitGTK 2.50.4 headers and libraries; the Vite/React frontend typechecks and builds;
  the compiled binary launches and initializes Tauri/GTK without crashing.
- What's **not** verified: actual interactive rendering and the real autofill behavior against
  a live portal. The sandbox this was built in has no `sudo`, so WebKitGTK's dev packages were
  obtained via a no-root `.deb` download workaround (see apps/desktop/README.md) that hits a
  WebKitGTK subprocess path mismatch — an artifact of that workaround, not of the app code,
  and irrelevant to the real Windows/WebView2 target. Manual QA on a real Windows machine
  against the real GST login page (this phase's original exit criterion) still needs to
  happen before this adapter is trusted — tracked here, not skipped silently.
- GST/Income Tax/TRACES/MCA selector values in the adapters are best-effort placeholders, not
  verified against the live portals (no network access to browse them from this environment) —
  same caveat, same tracking.

## Phase 5 — Additional Portals — GST, MCA, and INCOME_TAX verified live; rest still the blocking step
- All seven seeded portals (GST, Income Tax, TRACES, MCA, EPFO, ESIC, DGFT) now have a
  `PortalConfig` entry in `apps/desktop/src-tauri/src/portals/mod.rs`; all but GST are plain
  data entries added with no code, confirming the adapter-registry design actually delivers
  the "adding a portal is a config change" property it was designed for.
- Before writing selectors, a live-fetch pass was actually run against each reachable login
  page rather than guessing blind. Result, and why the selectors below are still unverified:
  TRACES and the Income Tax e-filing portal serve an empty shell to a non-browser fetch (both
  are client-rendered Angular apps — no login form exists in the static HTML), and MCA's login
  page returned HTTP 403 to the fetch (these portals actively push back on non-browser
  traffic, which is exactly the class of thing docs/threat-model.md already accounts for, and
  exactly why this product's automation only ever runs from the user's own real desktop
  browser session, never a server-side fetch). EPFO/ESIC/DGFT weren't fetched. So every
  selector remains a best-effort placeholder.
- New: Rust unit tests for the fill-script builder (`cargo test` in `apps/desktop/src-tauri`)
  — every seeded portal code resolves to an adapter, the generated script never contains
  `.submit()`/CAPTCHA/OTP handling, different portals produce different scripts, and a
  password shaped like a script-injection attempt stays safely JSON-escaped rather than
  breaking out of the injected script's string literal. This is real, automated coverage of
  the one part of the automation engine that doesn't require a live browser to test.
- **GST's exit criterion is now met, for real.** With the user driving a real screen/browser
  session (this environment has no Windows, but Tauri/WebKitGTK and a real Chrome extension
  are the same automation mechanism regardless of OS), the full flow was run against the live
  `services.gst.gov.in` login page in *both* automation surfaces — the desktop app and the new
  browser extension (Phase 5.5 below) — and visually confirmed: username and password filled
  correctly, CAPTCHA field untouched. This also caught a real bug neither a code read nor the
  unit tests could have: the fill script fired before the portal's Angular app had finished
  rendering the form, so nothing got filled on the first attempt. Fixed in both surfaces by
  polling for the fields to exist (up to ~10s) instead of a one-shot fill — see
  [browser-automation-design.md](browser-automation-design.md) §7.
- **MCA's exit criterion is now met too** (2026-08-26, same live-driven process as GST). This one
  needed real debugging, not just a timing fix: MCA's old login URL (`/mcafoportal/login.do`) had
  been permanently retired since 2025-06-18 and 404'd, so the first fix was finding MCA's actual
  V3 sign-in page. MCA also blocks automated fetches and runs an anti-devtools script, so the
  field selectors couldn't be inspected live the way GST's were — they were confirmed by reading
  the page's view-source by hand (bypasses the page's own JS entirely) and cross-checking against
  MCA's own login click-handler code, landing on `.userID input[type='text']` /
  `.password input[type='password']`. Even with correct selectors, a one-shot fill silently failed:
  MCA server-renders the login fields, then its own JS (Adobe AEM Adaptive Forms) rebuilds that
  part of the DOM shortly after, discarding whatever had just been set. Fixed generally, not just
  for MCA, by having the fill script keep re-asserting its values until they've held steady for
  two consecutive polls instead of filling once and stopping — see
  [browser-automation-design.md](browser-automation-design.md) §7. Username and password were
  visually confirmed filled in the running desktop app; CAPTCHA/OTP untouched.
- **INCOME_TAX's exit criterion is now met too** (2026-08-26), and it took real work: unlike GST
  and MCA, its login is a genuine two-screen wizard (User ID screen → client-side-routed Password
  screen whose field doesn't exist until the route change happens). Three separate bugs had to be
  found and fixed live before it worked — a username field id that's inconsistent between renders
  (matched both spellings), a visibility guard (`offsetParent !== null`) that silently
  false-negatives for `position: fixed` elements (switched to `getClientRects().length > 0`), and
  the fill script itself checking "which screen am I on" once at start-up instead of on every poll
  tick, plus stopping itself right after clicking Continue before it ever got a real chance to
  reach the password field. See [browser-automation-design.md](browser-automation-design.md) §7
  for the full trail, including a `wants_reinjection_on_navigation` mechanism (a Tauri
  `on_page_load` hook, and `chrome.webNavigation` in the extension) that was built as a fix first
  and turned out not to be the actual cause on the desktop side — kept in as harmless defensive
  insurance regardless. User ID and Password were both visually confirmed filled in the running
  desktop app; CAPTCHA and the mandatory "secure access message" checkbox were left untouched.
- Every other portal (TRACES, EPFO, ESIC, DGFT) remains an unverified placeholder — three
  confirmed adapters (GST, MCA, INCOME_TAX) is not a blanket claim about the rest. Each still
  needs its own live QA pass before it's trusted.

## Phase 5.5 — Browser Extension (added mid-Phase-6, user-requested)

The web app's "Open portal" was originally a plain link (no autofill — a web page cannot
script a different tab it opens; that's a browser security boundary, not a missing feature).
The user asked for autofill in the web app too, and the correct way to actually deliver that
in a browser context turned out to be worth building properly rather than working around: a
companion browser extension, `apps/extension` (Manifest V3, Chrome/Edge), which mirrors the
desktop app's Rust core almost exactly — deliberately "dumb," redeeming a portal-session's
one-time token and filling the two configured fields, while the web app's own React code keeps
owning session creation, event reporting, and the CAPTCHA-wait UI. See
[browser-automation-design.md](browser-automation-design.md) §8 for the design and
[apps/extension/README.md](../apps/extension/README.md) for the install flow.

**Verified live**, with the user's direct help (a real Chrome instance, the extension loaded
via `chrome://extensions` → Load unpacked — the initial attempt to load it via a command-line
flag was silently blocked by Chrome itself, confirming that path doesn't work and the
documented developer-mode UI flow is the one that actually needs to be supported): the web
app correctly detected the installed extension (button switched from a plain link to "Open
portal (autofill)"), and clicking it filled the real GST login page's username/password
fields via the extension exactly as it does via the desktop app, stopping before CAPTCHA.

## Phase 6 — Hardening & Launch Readiness — in progress

**Done:**
- Full backend security review, written up in [security-review.md](security-review.md) — found
  and fixed a **critical privilege-escalation bug** (unscoped `roleId` let a firm admin grant
  themselves the platform-only `SUPER_ADMIN` role), a **high-severity session-revocation
  bypass** (`switch-organization` could keep minting tokens off a revoked session), two
  **TOCTOU races** (refresh-token rotation and portal-session credential redemption could both
  be won twice by concurrent requests, defeating their reuse/single-use guarantees), and
  several medium/low findings (missing cache headers on plaintext responses, a fail-open kill
  switch, unvalidated query params reaching Prisma, unbounded input fields, a missing
  production guard on `PASSWORD_PEPPER`). 14 new regression tests
  (`apps/api/test/security-hardening.spec.ts`), including genuine concurrent-request races, all
  passing alongside the existing 30 (44/44 total).
- **17 high-severity dependency vulnerabilities** found via `pnpm audit` (Next.js DoS/SSRF
  advisories, a Multer DoS chain, `postcss`/`js-yaml`/`lodash`/`sharp` issues) — fixed by
  upgrading Next.js to 15.5.23 (verified: web app still typechecks/lints/builds clean on React
  18.3, no forced React 19 bump needed) and `pnpm.overrides` for the genuinely transitive ones.
  Down to 0 high/critical. This is now a standing CI gate, not a one-time fix.
- A real, working production `Dockerfile` for the API — built and actually run against the
  real Postgres/Redis, which caught and fixed three genuine build bugs along the way (Prisma
  client not present in the `pnpm deploy`-produced package, Corepack silently grabbing an
  incompatible pnpm major version outside the workspace tree, a `prisma`-as-devDependency vs.
  `--prod` deploy conflict).
- `.github/workflows/ci.yml`: install/typecheck/lint/test (with real Postgres+Redis service
  containers)/build/security jobs, YAML-validated (not run against a live GitHub Actions
  runner from this environment — see the caveat this shares with the desktop app's Linux build
  in [apps/desktop/README.md](../apps/desktop/README.md)).
- A real backup/DR drill against the local dev database (not a substitute for the quarterly
  production-scale drill, but the `pg_dump`/`pg_restore` mechanics and a real number for this
  data volume are now verified, not estimated) — see [deployment.md](deployment.md) §6.1.
  Sub-second backup/restore; row counts, a specific known record, and credential ciphertext
  confirmed byte-for-byte identical post-restore; schema fidelity (indexes, tables) confirmed.

**Not yet done — tracked, not silently skipped:**
- Performance pass on dashboard/search/audit-log queries at realistic data volume (current
  verification is correctness-focused, not load-tested).
- A dedicated web/desktop security review pass (the backend review was thorough; web/desktop
  were only covered incidentally while building them — see security-review.md §4).
- Automated test for the new account-lockout threshold itself (the mechanism is exercised
  indirectly by existing login tests, not a dedicated "N failed attempts then blocked" test).
- Postgres Row-Level-Security as defense-in-depth — still needs a dedicated least-privilege
  application DB role to be meaningful, which is a deployment-configuration step.
- A real staging environment stood up on actual infrastructure (this environment has no cloud
  access) — what's done instead is the artifacts a staging deploy would need: the Dockerfile,
  the CI pipeline, and a verified backup/restore procedure.

## Testing Strategy

| Layer | Tooling | Focus |
|---|---|---|
| Unit | Jest (api), Vitest (web/desktop) | Service logic, encryption helpers, RBAC permission resolution |
| Integration | Jest + Supertest against ephemeral Postgres/Redis | Full request pipeline per module, including negative auth cases |
| Database | Prisma migration tests | Schema migrations apply cleanly forward; RLS policies verified with a direct-SQL test as a different tenant |
| Security-focused | Dedicated test suites | Tenant isolation (org A can never read org B's rows via any endpoint), unauthorized credential access, role-permission matrix, credential encryption/decryption correctness, refresh-token rotation & reuse detection, audit log completeness for every catalog event |
| Desktop | Rust unit tests (adapter state machine) + manual QA checklist | CAPTCHA-pause behavior (automation must not proceed past password fill), secure storage read/write, idle lock |
| E2E | Playwright (web only, against a running stack) | Critical user journeys: signup→client creation→credential creation→task flow |

Fixtures: a seed script (`scripts/seed.ts`) creates two organizations with overlapping-looking
but isolated data specifically to make tenant-isolation bugs visible in manual testing, plus
one user per role for permission-matrix testing.

## Definition of Done (per module)
1. Implemented per the relevant design doc.
2. Unit + integration tests passing.
3. Type check and lint clean.
4. No sensitive-value logging (verified against the redaction rule).
5. Relevant `/docs` file updated if the implementation diverged from the design.
6. Security implications reviewed against [threat-model.md](threat-model.md).
