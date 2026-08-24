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

## Phase 3 — Web Application
- Next.js app: auth flow, dashboard, client list/detail, credential management UI (view
  metadata/rotate, no default plaintext exposure), task management, document upload/browse.
- `packages/api-client` typed hooks (TanStack Query) shared with desktop.
- Exit criteria: full CRUD flows usable end-to-end against the Phase 1–2 backend.

## Phase 4 — Windows Desktop Application
- Tauri shell, secure desktop auth (Credential Manager/DPAPI), client dashboard parity with web.
- Portal launcher + `PortalAutomationAdapter` engine + state machine.
- First adapter: GST portal — open, navigate, fill username/password, pause at CAPTCHA/OTP.
- Exit criteria: manual QA script confirms autofill works and reliably stops before any
  challenge on a real GST login attempt; no plaintext ever written to disk or logs (verified).

## Phase 5 — Additional Portals
- Income Tax, TRACES, MCA adapters; EPFO/ESIC/DGFT as configuration-only additions where
  possible per the adapter-registry design.
- Exit criteria: each adapter manually QA'd against its real portal login page.

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
