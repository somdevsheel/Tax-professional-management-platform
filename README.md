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
  /web        Next.js web application — not yet implemented (Phase 3)
  /desktop    Tauri + React Windows desktop app — not yet implemented (Phase 4)
/packages
  /types      Shared TypeScript types/enums (RBAC, DTOs) — source of truth for API contracts
  /config     Shared tsconfig
  /ui, /api-client, /validation, /security  — reserved for later phases
/docs         System design, architecture, security, API, desktop, browser-automation, threat
              model, deployment, roadmap
/infrastructure  docker-compose.yml (Postgres, Redis, MinIO)
```

See [docs/development-roadmap.md](docs/development-roadmap.md) for what's implemented vs. planned.

## Current Status (Phases 1–2 done)

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

Not yet built: the web app, the desktop app (so no actual browser automation yet — the backend
contract for it is in place), documents/tasks/compliance application code, and Postgres RLS as
defense-in-depth (tracked in docs/development-roadmap.md, deferred to Phase 6 alongside a
dedicated least-privilege DB role). See [docs/development-roadmap.md](docs/development-roadmap.md).

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

### Checks

```bash
cd apps/api
pnpm typecheck
pnpm lint
pnpm test        # unit + integration tests against the Postgres/Redis started above
pnpm build
```

## Security

This platform handles CA-firm and government-portal credentials. Read
[docs/security-design.md](docs/security-design.md) and [docs/threat-model.md](docs/threat-model.md)
before touching auth, the credential vault, tenant scoping, or the portal automation engine.
The product **never** bypasses CAPTCHA/OTP/MFA/rate limits on any portal — see
[docs/browser-automation-design.md](docs/browser-automation-design.md).
