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

## Phase 5 — Additional Portals — registry complete; live QA still the blocking step
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
- Exit criteria **not yet met**: each adapter still needs manual QA against its real, rendered
  portal login page on a real Windows machine (Phase 4's exit criterion, carried forward here
  since it never ran) — this environment has no path to that (no Windows, and these specific
  portals actively resist non-interactive/non-browser access, as just confirmed above).

## Phase 6 — Hardening & Launch Readiness
- Full test suite pass (unit/integration/security/e2e — see Testing Strategy below).
- Security review executed and written up in `/docs/security-review.md`.
- Performance pass on dashboard/search/audit-log queries.
- Deployment: staging environment stood up per [deployment.md](deployment.md), backup/DR drill
  executed once.
- Documentation pass across all `/docs` files to match final implementation.

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
