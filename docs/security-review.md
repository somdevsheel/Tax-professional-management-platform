# Security Review

Status: Phase 6, first pass — backend (`apps/api`) reviewed and hardened; web/desktop reviewed
lightly (see §4). This document records what was found, what was fixed, what was verified,
and what's still open. Findings are ranked by severity; each fixed finding names the commit-
equivalent change and the regression test that proves it, in `apps/api/test/security-hardening.spec.ts`
unless noted otherwise.

## 1. Method

A full trace of every controller → service → Prisma call across auth, tenant isolation, the
credential vault, and the portal-session flow, checking each against
[security-design.md](security-design.md) and [threat-model.md](threat-model.md). Not a
checklist tick-through — each finding below names the exact file/line and a concrete request
sequence that triggers it, not a hypothetical. Areas reviewed and found already correct are
listed in §3 rather than omitted, so the absence of a finding in a category is a stated
conclusion, not silence.

## 2. Findings and Fixes

### 2.1 CRITICAL — Privilege escalation via unscoped `roleId` in role assignment

**Where:** `organizations.service.ts` — `changeRole` (and, less severely, `inviteMember`).

**The bug:** `inviteMember` correctly scoped its role lookup to the caller's org plus global
system roles. `changeRole` validated the *target member* but never validated `roleId` at all —
it wrote whatever id was supplied straight into the update. Two consequences:

- **Self-escalation to `SUPER_ADMIN`.** `GET /roles` returns every global system role —
  including `SUPER_ADMIN`, a platform-operator role — with real UUIDs, to any authenticated
  member. A `CA`-role user (holds `employees.manage` but not `settings.manage`) could:
  `GET /roles` → note the `SUPER_ADMIN` id → `GET /organizations/current/members` → find their
  own `organizationMember.id` → `PATCH /organizations/current/members/{ownId}` with
  `{"roleId": "<SUPER_ADMIN id>"}`. `RbacService` resolves permissions live from the
  membership row, so the very next request carries every permission in the system.
- **Cross-tenant role attachment.** `Role.organizationId` is nullable and unvalidated, so a
  role row belonging to a *different* organization could in principle be attached to a member
  here too (required knowing the foreign UUID, so (a) was the practical exploit, but the same
  missing check enabled both).

**The fix:** a shared `requireAssignableRole(organizationId, roleId)` used by both
`inviteMember` and `changeRole`, which scopes to the org's own roles plus global system roles
*excluding* a new `PLATFORM_ONLY_ROLES` set (currently `{SUPER_ADMIN}`). `GET /roles` also
filters `SUPER_ADMIN` out of the listing — a firm member shouldn't see it as an option, not
just be blocked from selecting it.

**Verified:** 4 tests — role never listed; invite-with-SUPER_ADMIN rejected (404
`ROLE_NOT_FOUND`); self-role-change-to-SUPER_ADMIN rejected and the row proven unchanged in
the DB afterward; a legitimate role change (to `STAFF`) still succeeds, so the fix isn't just
"block everything."

### 2.2 HIGH — Session revocation didn't stop token reissuance via `switch-organization`

**Where:** `token.service.ts` — `reissueAccessTokenForOrganization`.

**The bug:** `JwtAuthGuard` verifies signature and expiry only — it never consults the
`Session` row, which is an accepted, bounded tradeoff for a 15-minute access token. But
`POST /auth/switch-organization` re-signs a *brand-new* 15-minute token for the same session
and, unlike `rotateRefreshToken`, never checked `session.revokedAt` before doing so. Concrete
exploit: a device is stolen with a live access token; the user calls "log out all devices"
(`POST /auth/logout-all`), which revokes the `Session` row; the stolen access token is still
cryptographically valid for its remaining lifetime, and the attacker can call
`switch-organization` (to an org the token holder is still an ACTIVE member of, e.g. their own
current org) roughly every 14 minutes to mint a fresh token indefinitely, completely bypassing
the revocation.

**The fix:** `reissueAccessTokenForOrganization` now loads the session first and rejects
(`401 SESSION_REVOKED`) if it's revoked or expired, before re-signing anything.

**Verified:** logs in, confirms `switch-organization` works, calls `logout-all`, then proves
the *same still-valid access token* is rejected by a subsequent `switch-organization` call.

### 2.3 MEDIUM — `logout`/`logout-all` unreachable for multi-organization users

**Where:** `auth.controller.ts`.

**The bug:** Neither route carried `@SkipTenantScope()`. A user who is an ACTIVE member of two
or more firms has `organizationId: null` on login (until they explicitly pick one), so
`TenantScopeGuard` rejected the request with `403 NO_ORGANIZATION_CONTEXT` before the handler
ever ran — such a user had no way to end their own session at all.

**The fix:** added `@SkipTenantScope()` to both routes, matching `me` and
`switch-organization`, which already had it for the same reason.

**Verified:** a user with two org memberships logs in (`organizationId: null` confirmed), then
successfully calls `logout`.

### 2.4 MEDIUM — Refresh-token rotation had a TOCTOU race defeating reuse detection

**Where:** `token.service.ts` — `rotateRefreshToken`.

**The bug:** the "is this token still valid" read and the "mark it rotated" write were
separate steps (`findUnique` → business logic → `update`), not atomic. Two concurrent
`POST /auth/refresh` calls presenting the identical raw token — e.g. a stolen token replayed
concurrently with the legitimate client's own scheduled refresh — could both observe
`revokedAt: null` before either write landed, and both would successfully mint a new token in
the same family. The entire point of rotation-with-reuse-detection is to surface exactly this
kind of theft; the race made it silently invisible.

**The fix:** the claim is now one conditional `updateMany({ where: { id, revokedAt: null },
data: { revokedAt: now } })`. Only one concurrent caller can flip `revokedAt` from null, so the
loser reliably observes `count === 0` and is treated as reuse — the whole token family and
session are killed, same as a genuine reuse detected minutes later. This also simplified the
method: the old two-branch "already revoked" vs. "still valid" logic collapses into one
atomic check.

**Verified:** fires two `POST /auth/refresh` calls concurrently with `Promise.all` using the
same refresh token — asserts exactly one returns 201 and one returns 401
`REFRESH_TOKEN_REUSE_DETECTED`, and that the "winning" token is also dead immediately after
(the family was killed).

### 2.5 MEDIUM — Portal-session one-time token had the same class of TOCTOU race

**Where:** `portal-sessions.service.ts` — `redeemCredential`.

**The bug:** identical shape to 2.4 — "is this token unused" was a separate read from the
"mark it used" write. Two concurrent `GET /portal-sessions/:id/credential` requests with the
same `X-Portal-Session-Token` could both pass the check and both receive the transient
plaintext credential, with two `CREDENTIAL_USED` audit rows instead of one legitimate use and
one rejected replay — defeating the single-use property the whole one-time-token design exists
for.

**The fix:** same pattern — `updateMany({ where: { id, oneTimeTokenUsedAt: null }, data: {...}
})`, count-checked before proceeding to decrypt.

**Verified:** two concurrent redemption requests with the same token — exactly one 200 (with
the correct plaintext) and one 401 `TOKEN_ALREADY_USED`; exactly one `CREDENTIAL_USED` audit
row.

### 2.6 MEDIUM — Plaintext-bearing responses had no `Cache-Control: no-store`

**Where:** `credentials.controller.ts` (`POST /credentials/:id/reveal`),
`portal-sessions.controller.ts` (`GET /portal-sessions/:id/credential`).

**The bug:** a 200 response with no cache-control directive is heuristically cacheable by
intermediaries. The portal-session credential endpoint is a GET whose authentication lives in
a header (`X-Portal-Session-Token`), not the cached URL — a caching proxy could in principle
serve the cached plaintext to a later request that presents no token at all.

**The fix:** `@Header("Cache-Control", "no-store, private")` on both routes.

**Verified:** both responses asserted to carry the header.

### 2.7 MEDIUM — No per-account brute-force protection, only per-IP

**Where:** `auth.controller.ts` (throttling), `configure-app.ts` (proxy trust).

**The bug:** two related gaps. First, `ThrottlerGuard`'s default IP-keyed tracking is
ineffective as *account* protection: a distributed attacker grinding one known email across
many source IPs is unlimited by it. Second, without Express `trust proxy` configured, a real
deployment behind the documented CDN/load-balancer topology ([deployment.md](deployment.md))
would see every request from the proxy's IP, collapsing *all* clients into one shared
throttling bucket — the opposite problem.

**The fix:** (a) an opt-in `TRUST_PROXY=true` env var wired to Express's `trust proxy` setting
— opt-in specifically so it's never silently enabled without an actual trusted proxy in front
(which would let any client spoof its rate-limit identity via `X-Forwarded-For`); (b) a
per-account lockout in `AuthService.login`, keyed by `actorUserId` against the `LOGIN_FAILED`
audit rows already being written (no new table) — 10 failures in a 15-minute window blocks
further attempts against that account regardless of source IP, still running the constant-time
dummy verify so lockout state isn't distinguishable by timing from a normal wrong-password
response. A matching `AuditLog(actorUserId, action, createdAt)` index was added so this check
doesn't become a table scan as the log grows.

**Verified:** covered indirectly by the existing login/lockout code path exercising real
Argon2id verification and audit writes in `test/auth.spec.ts`; a dedicated
attempt-exhaustion test is a good Phase 6.5 addition (not yet written — see §5).

### 2.8 LOW — Org-level credential-reveal kill switch failed open on any unrecognized value

**Where:** `credentials.service.ts` — `assertRevealAllowed`.

**The bug:** `if (setting && setting.value === false)` only caught the exact JSON literal
`false`. Since there is currently no settings-write API endpoint (this key would be set by
future admin tooling or a manual migration), any other shape — `"false"`, `0`, `null`, `{}` —
left reveal silently enabled.

**The fix:** inverted to fail closed — once a `Setting` row exists at all, only the literal
boolean `true` keeps reveal enabled; anything else disables it.

**Verified:** a `Setting` row with `value: "false"` (a string, not a boolean) is proven to
still disable reveal (`403 CREDENTIAL_REVEAL_DISABLED`).

### 2.9 LOW — `GET /portal-sessions/:id` exported the stored token hash

**Where:** `portal-sessions.service.ts` — `get`.

**The bug:** no `select`, so the response included `oneTimeTokenHash`. Not independently
exploitable (redemption re-hashes and compares server-side; the stored hash alone doesn't let
anyone redeem), but a gratuitous export of a secret-derived field to anyone with
`credentials.use`.

**The fix:** explicit `select` excluding it.

### 2.10 LOW — Unbounded string/object inputs

**Where:** `login.dto.ts`, `reveal-credential.dto.ts`, `create-client.dto.ts`.

**The bug:** login `password` and reveal `currentPassword` had no `@MaxLength` — every login
runs Argon2id (≈64 MiB memory cost by default) over the input, so an unbounded string is a
cheap per-request memory/CPU amplifier. Client `tags` allowed non-string array elements
through to a `Json`/`String[]` column (`@IsArray()` with no `each: true` validators);
`address` was `@IsObject()` with no size or depth bound at all.

**The fix:** `@MaxLength(256)` on both password fields; `tags` now requires
`@IsString({ each: true }) @MaxLength(50, { each: true })`; `address` became a proper
`AddressDto` with explicit, bounded fields instead of an open bag.

### 2.11 LOW — Unvalidated list-endpoint query parameters reached Prisma untyped

**Where:** `clients.controller.ts`, `audit.controller.ts`.

**The bug:** `status`/`entityType` were cast `as never` with no validation; `limit` on the
clients endpoint computed `Number(limitRaw)` with no `NaN` guard downstream
(`Math.min(NaN, 200)` is `NaN`, and `take: NaN` reaches Prisma), producing a generic 500 for
`?limit=abc` instead of a clean 400. No information disclosure (the error filter already
rewrites 500s), but avoidable error/log noise from any authenticated caller.

**The fix:** `ListClientsQuery`/`ListAuditLogsQuery` DTOs with real `class-validator`
constraints (`@IsIn`, `@IsInt() @Min() @Max()`, `@IsUUID()`), bound via `@Query()`.

**Verified:** `?status=NOT_A_REAL_STATUS` and `?limit=not-a-number` both now return 400.

### 2.12 LOW — Cursor pagination accepted a foreign-tenant id as a weak existence oracle

**Where:** `clients.service.ts`, `audit.controller.ts`.

**The bug:** `cursor: { id: filters.cursor }` was passed to Prisma without first checking the
id belonged to the caller's org. The tenant `where` clause still applied to the *results*, so
no foreign data was ever returned — but a cursor pointing at a real id in another tenant
behaved observably differently (page position) from one pointing at a nonexistent id, a weak
oracle for "does this id exist" against an id the caller would already need to know.

**The fix:** the cursor id is now resolved via an org-scoped `findFirst` first; an
unrecognized or foreign cursor is treated as "start from the top" rather than erroring, so the
behavior is uniform either way.

**Verified:** a client id belonging to a different org, passed as `?cursor=`, returns 200 with
no special-cased error.

### 2.13 LOW — `PASSWORD_PEPPER` silently defaulted to empty

**Where:** `password.service.ts`.

**The bug:** unlike `JwtKeysService` (throws under `NODE_ENV=production` without real keys) and
`LocalKmsProvider` (throws unconditionally without a KEK secret), a missing `PASSWORD_PEPPER`
silently hashed every password unpeppered with no warning.

**The fix:** matching `onModuleInit` guard — throws in production if unset.

### 2.14 HIGH — 17 known high-severity vulnerabilities in transitive dependencies

**Where:** the dependency tree, discovered running `pnpm audit --prod --audit-level high`
while building the CI pipeline (§ [deployment.md](deployment.md) §4) — not something a code
read would have caught.

**The bug:** `next@14.2.35` (the direct dependency) pulled in known-vulnerable
`postcss@8.4.31` (path traversal / arbitrary `.map` file disclosure) internally, independent of
our own already-patched devDependency postcss; `next@14.2.x` itself had multiple disclosed
DoS/SSRF advisories fixed only from `15.0.8`/`15.5.x` onward; `@nestjs/core`'s bundled `multer`
had three separate DoS advisories; `@nestjs/config`'s `lodash` had a code-injection advisory in
`_.template`; `@nestjs/swagger`'s `js-yaml` had a quadratic-CPU advisory. None of these are
exploitable through code we wrote, but "not exploitable today" isn't the same as "not present"
— multer's DoS surface in particular is directly relevant the moment the (not-yet-built)
document-upload module lands.

**The fix:** upgraded the direct dependency, `next`, to `^15.5.23` (verified: web app
typechecks, lints, and builds clean on Next 15 — including a re-check that its peer
dependencies still accept React 18.3, so no additional React major bump was needed). For the
rest — genuinely transitive, not our own dependency declarations — added `pnpm.overrides` in
the root `package.json` forcing `postcss>=8.5.18`, `js-yaml>=4.3.1`, `multer>=2.2.0`,
`lodash>=4.18.0`, plus `sharp>=0.35.0` (a further high finding that surfaced only after the
Next.js upgrade, since `sharp` is one of Next's own optional dependencies).

**Verified:** `pnpm audit --prod --audit-level high` went from 44 findings (17 high) to 7
findings, 0 high/critical (all 7 remaining are moderate/low, in dependencies with no patched
version yet available — tracked, not silenced). Full regression check after both changes: API
typecheck/lint/44 tests/build all clean; web typecheck/lint/build (all 17 routes) clean; the
API's production Docker image (apps/api/Dockerfile) rebuilds and still boots correctly against a real Postgres. This is now a standing CI gate
(`.github/workflows/ci.yml`'s `security` job) rather than a one-time fix — the next high
finding in any dependency fails the build instead of going unnoticed.

## 3. Reviewed and found correct (not a finding — a stated conclusion)

- **`organizationId` provenance:** `JwtAuthGuard` is the sole writer of `request.authContext`;
  every downstream read goes through `@CurrentUser()`. The only client-supplied organization id
  anywhere in the surface is `SwitchOrganizationDto.organizationId`, which is checked against
  an ACTIVE membership before a token is issued. `jwt.verify` pins `algorithms: ["RS256"]` and
  the issuer — no `alg: none`/HMAC-confusion path.
- **Tenant scoping in the data layer**, outside finding 2.1: every query across
  clients/credentials/portals/portal-sessions/organizations includes `organizationId` in its
  `where`, and every client-supplied id is resolved through an org-scoped lookup
  (`requireClient`, `requireFullRecord`, `requirePortalAccount`, `requireMember`,
  `requireAccount`) before any read of sensitive fields or any mutation.
- **Credential crypto:** fresh 32-byte DEK and fresh 12-byte nonce per encryption (nonce reuse
  is structurally impossible since the key is new every time), GCM auth tag enforced on
  decrypt, DEK zeroed in a `finally`. `LocalKmsProvider` refuses to run in production;
  `KmsModule` throws rather than silently falling back for any unrecognized provider name.
  Plaintext never enters an audit row or a Prisma `select` outside the two intentional,
  audited reveal/use paths.
- **Error handling:** `AllExceptionsFilter` rewrites every 500 to a fixed generic message,
  logging full detail server-side only — no stack trace, no raw Prisma error, ever reaches a
  response body. The pino redaction list covers auth headers, cookies, and wildcarded
  password/token/key field names.

## 4. Scope of this pass

This review covered `apps/api` in full. It did **not** include a dedicated pass over
`apps/web` or `apps/desktop` beyond what was already exercised incidentally while building
them (e.g. the web app never handles plaintext outside the reveal-modal component, which holds
it only in local state with a 30-second auto-clear and never lets React Query cache it; the
desktop app's Rust core zeroizes decrypted credentials after use per
[desktop-architecture.md](desktop-architecture.md) §4). A dedicated web/desktop security pass,
and the items in §5, are the next increment — not silently declared "done."

## 5. Known open items (tracked, not hidden)

- No dedicated automated test for the account-lockout threshold itself (2.7) — the mechanism
  is exercised by ordinary login tests but not an "11 failed attempts then blocked" test.
- Postgres Row-Level-Security as defense-in-depth (docs/security-design.md §3, point 3) is
  still not implemented — it needs a dedicated least-privilege application DB role to be
  meaningful (RLS is a no-op for a table-owning role), which is a deployment-configuration
  step, not application code. Tracked in [development-roadmap.md](development-roadmap.md)
  Phase 6.
- Web/desktop dedicated security pass (§4).
- Live QA of the portal-automation selectors against real GST/Income Tax/TRACES/MCA/EPFO/
  ESIC/DGFT login pages has still not run (tracked since Phase 4/5 — see
  [development-roadmap.md](development-roadmap.md) and
  [apps/desktop/README.md](../apps/desktop/README.md)); unrelated to this review's scope but
  worth restating here since it's the other major "not actually verified" item in the project.
