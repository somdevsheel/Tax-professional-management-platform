# Production Readiness Checklist

This is the concrete, actionable counterpart to [deployment.md](deployment.md) (which describes
the target architecture) and [security-review.md](security-review.md) (which tracks what's been
audited). Every item below is either **done**, a **decision only you can make** (hosting,
providers — no amount of code changes this), or a **config change** (the code already supports
it; it just needs real values instead of dev placeholders).

## 1. Already done

- Docker multi-stage build (`apps/api/Dockerfile`) — builds and runs against real Postgres,
  verified.
- CI pipeline (`.github/workflows/ci.yml`) — typecheck, lint, unit + integration tests (against
  ephemeral Postgres/Redis), build, dependency audit.
- Encryption-at-rest for the credential vault (envelope encryption, per-credential DEK).
- Tenant isolation (enforced in application code; Postgres RLS as a second layer is still open —
  see §4).
- Full audit logging, append-only.
- Password reset (email-based, single-use, 30-minute TTL, revokes all sessions on completion).
- Rate limiting, security headers, CORS allow-list, step-up auth for credential reveal.
- JWT signing: already refuses to boot in production without a real keypair configured (falls
  back to an ephemeral dev-only keypair otherwise) — no code change needed, just §2.3 below.

## 2. Config changes — code already supports these, they just need real values

Everything here is a `.env` (or secrets-manager) value, not a code change. `.env.example` at the
repo root documents every variable.

1. **`NODE_ENV=production`** — this alone activates every refuse-to-boot-unsafely guard listed
   in §3.
2. **`DATABASE_URL`** — point at the real production Postgres.
3. **JWT keypair** — generate a real one and store the paths/files via your secrets manager,
   never in the repo:
   ```
   openssl genrsa -out jwt-private.pem 2048
   openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
   ```
4. **`PASSWORD_PEPPER`**, **`KEK_LOCAL_DEV_SECRET`** (or its KMS-provider equivalent) — real
   random secrets, never the `dev-local-*`/`change-me-*` placeholders.
5. **`OBJECT_STORAGE_*`** — point at a real S3-compatible bucket (AWS S3, or a hosted MinIO)
   instead of the local dev instance.
6. **`WEB_APP_ORIGIN`** — your real web app domain(s); this also becomes the domain used in
   password-reset email links.
7. **`TRUST_PROXY=true`** — only once the API genuinely sits behind exactly one trusted reverse
   proxy/load balancer (see the warning comment next to it in `.env.example` — wrong here means
   IP-based rate limiting becomes spoofable).

## 3. Decisions only you can make — each has a refuse-to-boot safety net until you do

These three follow the identical pattern (`infra/kms/`, `infra/antivirus/`, `infra/email/`): a
pluggable interface, one dev-only implementation that **refuses to start under
`NODE_ENV=production`**, and a documented extension point for the real thing. The code cannot
pick these for you — they're genuine product/vendor decisions:

1. **Key management** (`KMS_PROVIDER`) — AWS KMS, GCP KMS, or HashiCorp Vault for the credential
   vault's root key. `LocalKmsProvider` (dev-only) refuses production.
2. **Antivirus scanning** (`ANTIVIRUS_PROVIDER`) — a ClamAV daemon or a cloud AV API for document
   uploads. `NoopAntivirusScanner` (dev-only, only catches the harmless EICAR test file) refuses
   production. **This one matters most to get right before real client documents flow through
   the platform** — it's the difference between "uploads are scanned" and "uploads are not
   scanned at all."
3. **Outbound email** (`EMAIL_PROVIDER`) — any SMTP-compatible provider (SES, SendGrid, Postmark,
   your own mail server) for password-reset and invite emails. `NoopEmailService` (dev-only, logs
   instead of sending) refuses production.

## 4. Not yet built — real gaps, tracked not hidden

- **Postgres Row-Level Security** as defense-in-depth beyond application-level tenant scoping
  (docs/security-design.md §3, point 3) — needs a dedicated least-privilege application DB role
  to be meaningful (RLS is a no-op for a table-owning role). Deferred since Phase 2, still open.
- **A real SMTP `EmailService` implementation** — the interface and dev stub exist (§3.3); the
  actual `nodemailer`-based provider isn't written yet because no provider had been chosen. Small
  addition once you pick one — see `infra/email/email.module.ts`'s comment for exactly where it
  plugs in.
- **Windows desktop build** — this development sandbox has no Windows, so the installer has never
  actually been built, only compile-verified via cross-checks. Needs either a real Windows
  machine or a CI workflow on a `windows-latest` runner (Tauri's official recommendation — cross-
  compiling Windows targets from Linux is not realistically supported for a WebView2 app).
- **Hosting/domain** — not yet decided. Nothing in this checklist can proceed to a real deploy
  without this.

## 5. Suggested order

1. Decide hosting (§4) and pick the three providers in §3 — these gate everything else.
2. Fill in §2's config values against that real infrastructure.
3. Run a fresh `pnpm test` and the Docker build against the real `DATABASE_URL` before the first
   real deploy.
4. Set up the Windows CI workflow (or build locally on Windows) for the desktop installer.
5. Postgres RLS (§4) as a hardening pass once the above is live and stable — not a blocker to a
   first production deploy, since application-level tenant scoping is already the enforced
   boundary; RLS is defense-in-depth on top of it.
