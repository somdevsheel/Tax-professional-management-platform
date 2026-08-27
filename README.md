# Tax Professional Management Platform

A multi-tenant SaaS platform for Indian tax professionals, CAs, and CA firms — client
management, portal credential vault, documents, tasks, and compliance tracking, with a web
app, a Windows desktop app, and (later) mobile, all on one backend.

**Start here:** [docs/system-design.md](docs/system-design.md) — architecture, data flow,
threat model, and every other design document is indexed from there. Read it before changing
anything security- or tenancy-related; the docs are the contract this codebase is reviewed
against, not an afterthought.

## Repository Layout

```
/apps
  /api        NestJS backend (modular monolith) — implemented (Phases 1–2)
  /web        Next.js web application — implemented (Phase 3, scoped to Phase 1–2 backend)
  /desktop    Tauri + React Windows desktop app — implemented (Phase 4), GST portal login
              verified live — see apps/desktop/README.md
  /extension  Browser extension (Manifest V3) — same portal-autofill flow as the desktop app,
              for the web app — implemented (Phase 5.5), GST verified live — see apps/extension/README.md
/packages
  /types      Shared TypeScript types/enums (RBAC, DTOs) — source of truth for API contracts
  /api-client Typed API client (token lifecycle, silent refresh) shared by web and, later, desktop
  /config     Shared tsconfig
  /ui, /validation, /security  — reserved for later phases
/docs         System design, architecture, security, API, desktop, browser-automation, threat
              model, deployment, roadmap
/infrastructure  docker-compose.yml (Postgres, Redis, MinIO)
```

See [docs/development-roadmap.md](docs/development-roadmap.md) for what's implemented vs. planned.

## Current Status (Phases 1–5 built, Phase 6 in progress)

**Phase 1 — Foundation:** authentication (Argon2id, RS256 JWT access tokens, rotating refresh
tokens with reuse detection), multi-tenancy (organization-scoped JWT + guard pipeline), RBAC
(7 system roles, permission-based route guards), organization/member management, append-only
audit log.

**Phase 2 — Core domain:** client management (CRUD, contacts, assignments, search); portal
catalog + portal accounts; the credential vault (envelope encryption — a fresh per-credential
DEK wrapped by a pluggable KMS provider, AES-256-GCM, step-up-gated reveal, rotation); and the
portal-session one-time-token flow that backs the product's core "[Open GST Portal]" workflow
end to end at the API layer. Full Prisma schema for every domain in
[docs/database-design.md](docs/database-design.md) is in place. 30 tests passing (unit +
integration against a real Postgres), covering tenant isolation, RBAC denial, refresh-token
reuse detection, encryption round-trip/tamper detection, credential audit coverage, and
single-use portal-session tokens.

**Phase 3 — Web app:** Next.js dashboard covering everything above — auth, client list/detail,
portal accounts, full credential lifecycle (create/rotate/delete/reveal with a step-up
password modal), employees, and a filterable audit-log viewer. Tasks/Compliance/Documents/
Reports show as labeled "coming soon" placeholders in the nav rather than being built against
backend endpoints that don't exist yet. `pnpm typecheck`/`lint`/`build` all clean; the full
flow was verified end-to-end against a running API. Not yet covered: automated browser tests
for the web app itself (no headless-browser tooling in this environment) — tracked for Phase 6.

**Phase 4 — Desktop app:** Tauri (Rust + React) client — secure desktop auth via OS-native
credential storage (the `keyring` crate: Windows Credential Manager/DPAPI, Secret
Service/libsecret on Linux, Keychain on macOS), client list/detail, and the portal launcher
wired end to end against the portal-session API: open the portal window → redeem the one-time
credential token *in Rust only* → fill username/password → hand control to the human for
CAPTCHA/OTP → report completion. **Verified live**, not just compiled: with the user driving a
real screen, the app ran end to end against the real `services.gst.gov.in` login page —
username and password filled correctly, CAPTCHA left untouched. That run also caught and fixed
a real timing bug (the fill script needed to poll for the form to finish rendering, not fire
once immediately) — see [apps/desktop/README.md](apps/desktop/README.md) for the full story.

**Phase 5 — Additional portals:** all seven seeded portals (GST, Income Tax, TRACES, MCA,
EPFO, ESIC, DGFT) have a registry entry in the desktop adapter engine, all but GST/INCOME_TAX/MCA
as plain config (no code) — the "adding a portal is a data change" design actually holds up.
**GST, MCA, and Income Tax are now confirmed against their live portals** (above, and see
[browser-automation-design.md](docs/browser-automation-design.md) §7 for the fuller stories — MCA
needed its dead login URL replaced and its selectors hand-verified since it blocks automated
fetches and dev tools; Income Tax needed real bug-hunting, being a genuine two-screen wizard
whose username field id turned out to be inconsistent between renders and whose fill script was
checking "which screen am I on" only once instead of on every poll). Every other portal's
selectors are still unverified — a live-fetch pass found TRACES also serves a client-rendered SPA
with no static login form. New Rust unit tests (`cargo test`) cover the fill-script builders,
including that a portal password shaped like a script-injection attempt stays safely escaped.

**Phase 5.5 — Browser extension** (added mid-Phase-6, user-requested): the web app's "Open
portal" was originally a plain link — a web page can't script a different tab, so autofill
there needs the same kind of permission a password manager's browser integration has. Built
`apps/extension` (Manifest V3), mirroring the desktop app's Rust core almost exactly: the
extension only redeems the one-time credential and fills the two fields, while the web app's
own code keeps owning session creation and the CAPTCHA-wait UI. **Verified live** the same way
as the desktop app — real Chrome, real GST login page, filled correctly.

**Phase 6 — Hardening (in progress):** a full backend security review found and fixed a
**critical privilege-escalation bug** (a firm admin could grant themselves the platform-only
`SUPER_ADMIN` role — closed), a **high-severity session-revocation bypass**, and two
**concurrency races** that defeated refresh-token and portal-session single-use guarantees —
all with regression tests, including genuine concurrent-request races, proving the fixes hold
(44/44 backend tests passing). Separately, `pnpm audit` turned up **17 high-severity dependency
vulnerabilities**; fixed (Next.js upgraded to 15.5.23, transitive deps pinned via overrides) —
now 0 high/critical, enforced going forward by a new CI pipeline
(`.github/workflows/ci.yml`). A production Dockerfile for the API was built and actually run
against real Postgres/Redis (catching three real build bugs along the way), and a real
backup/DR drill (`pg_dump`/`pg_restore`, byte-for-byte data verified) was executed against the
local database. Full findings: [docs/security-review.md](docs/security-review.md). Not yet
done: a dedicated web/desktop security pass, load testing, and Postgres RLS as
defense-in-depth — see [docs/development-roadmap.md](docs/development-roadmap.md) for the
complete, honest breakdown.

Not yet built: documents/tasks/compliance application code. See
[docs/development-roadmap.md](docs/development-roadmap.md).

## Local Development

Prerequisites: Node 20+, pnpm 9+, Docker.

```bash
pnpm install

# Start Postgres/Redis/MinIO (non-default host ports — see infrastructure/docker-compose.yml
# — chosen to avoid clashing with anything else already running on your machine)
pnpm docker:up

# Configure environment
cp .env.example .env
# Edit .env: set PASSWORD_PEPPER and KEK_LOCAL_DEV_SECRET to any local dev value.
# JWT keys are optional in development — an ephemeral RS256 keypair is generated automatically
# if JWT_PRIVATE_KEY_PATH/JWT_PUBLIC_KEY_PATH are unset (see docs/security-design.md §2).
ln -sf ../../.env apps/api/.env   # apps/api reads its own .env

cd apps/api
pnpm prisma:migrate     # creates schema
pnpm seed                # seeds system roles/permissions/portal catalog — required before first registration
pnpm dev                 # starts the API on :4000 (PORT in .env to change)
```

Verify: `curl http://localhost:4000/health` and `curl http://localhost:4000/health/ready`.

**Web app** (in a second terminal, with the API above still running):

```bash
cd apps/api && pnpm prisma:generate   # generates the Prisma client apps/web's build doesn't need directly, but api-client's types do
pnpm --filter @tax-platform/types build
pnpm --filter @tax-platform/api-client build

cd apps/web
cp .env.example .env.local   # NEXT_PUBLIC_API_URL defaults to http://localhost:4000
pnpm dev                      # starts the web app on :3000
```

**Desktop app** — see [apps/desktop/README.md](apps/desktop/README.md) (Windows prerequisites,
and the Linux-specific WebKitGTK version note if you're developing on Linux).

### Checks

```bash
cd apps/api
pnpm typecheck
pnpm lint
pnpm test        # unit + integration tests against the Postgres/Redis started above
pnpm build

cd ../web
pnpm typecheck
pnpm lint
pnpm build

cd ../desktop
pnpm typecheck
cd src-tauri && cargo check && cargo clippy && cargo test
```

## Security

This platform handles CA-firm and government-portal credentials. Read
[docs/security-design.md](docs/security-design.md) and [docs/threat-model.md](docs/threat-model.md)
before touching auth, the credential vault, tenant scoping, or the portal automation engine.
The product **never** bypasses CAPTCHA/OTP/MFA/rate limits on any portal — see
[docs/browser-automation-design.md](docs/browser-automation-design.md).




git add .
git commit -m "add new features"
git push origin main