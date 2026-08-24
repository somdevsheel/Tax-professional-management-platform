# Architecture — Component & Repository Design

## 1. Monorepo Layout

```
/apps
  /api        NestJS backend (modular monolith)
  /web        Next.js web application
  /desktop    Tauri + React desktop application
/packages
  /ui         Shared React component library (web + desktop)
  /types      Shared TypeScript types/DTOs (source of truth for API contracts)
  /api-client Typed API client (TanStack Query hooks) used by web + desktop + future mobile
  /config     Shared eslint/tsconfig/tailwind config
  /validation Shared Zod schemas (used both client-side and as NestJS DTO validation source)
  /security   Shared crypto primitives (envelope encryption helpers) used by api and desktop
/docs         Architecture & design documents (this set)
/infrastructure  Docker Compose, IaC, deployment manifests
/scripts      Dev/setup/one-off scripts
/tests        Cross-app e2e tests (Playwright, against web; separate desktop e2e harness)
```

Package manager: **pnpm workspaces** (fast, disk-efficient, strict dependency resolution —
prevents "phantom dependency" bugs that are especially risky in a security-sensitive codebase).

Why a monorepo: `packages/types` and `packages/validation` are shared verbatim between the
NestJS DTOs and the web/desktop clients, so a breaking API change fails typecheck at build
time across every consumer instead of at runtime in production.

## 2. Backend Module Map (`apps/api`)

```
apps/api/src
  auth/            login, refresh, logout, password reset, session management
  organizations/   firm CRUD, membership, invitations
  rbac/            roles, permissions, guards, decorators
  users/           user profile, platform-level user record
  clients/         client CRUD, client_contacts, client_assignments
  portals/         portal catalog, portal_accounts, PortalAutomationAdapter contracts (types only — automation itself lives in the desktop app)
  credentials/     credential vault: encryption, access control, portal-session issuance
  documents/       document metadata, object-storage integration, access control
  tasks/           task CRUD, comments, recurrence
  compliance/      configurable compliance-type framework, compliance_items lifecycle
  notifications/   in-app/email/desktop notification dispatch
  audit/           audit log writer + query API (append-only)
  common/          guards, interceptors, filters, decorators shared across modules
  infra/           Prisma service, Redis service, queue module, object-storage service, KMS client
```

**Module boundary rule:** a module may only reach another module's data through that module's
service (never its Prisma repository directly). This is enforced by NestJS module
encapsulation (only exported providers are importable) and is the seam that makes future
extraction into separate services cheap: e.g. if `credentials` needs to become its own service
for compliance reasons, only the `CredentialsService` call sites need to become HTTP/gRPC
calls — nothing else in the codebase reaches into its tables directly.

## 3. Why NestJS

- First-class DI, module system, and guard/interceptor pipeline map directly onto the
  AuthN → tenant-scope → RBAC → handler pipeline this product requires everywhere.
- Native support for the layered structure (controller/service/repository) the codebase needs
  to keep "database queries scattered everywhere" from happening.
- Mature ecosystem for exactly the cross-cutting concerns this product needs: `class-validator`
  DTOs, Prisma, BullMQ, OpenAPI (`@nestjs/swagger`), rate limiting (`@nestjs/throttler`).

## 4. Why Prisma

Type-safe query builder generated from one schema file that also serves as living
documentation of the database design; migrations are tracked and reviewable in git.
Trade-off accepted: Prisma's row-level-security integration is weaker than raw SQL, so
tenant isolation is enforced at the **application layer** (a mandatory `organizationId` filter
injected by a repository base class/guard, never left to individual query authors — see
[security-design.md](security-design.md) §3) rather than relying solely on Postgres RLS.
Postgres RLS is layered on top in production as defense-in-depth (§ [database-design.md](database-design.md)).

## 5. Why Next.js for Web

App Router + Server Components reduce the amount of sensitive data ever shipped to the
browser bundle; React Server Actions are *not* used for anything credential-related (all
credential operations go through the same authenticated REST API the desktop app uses, so
there is exactly one code path to secure and audit, not two).

## 6. Why Tauri (not Electron) for Desktop

| Criterion | Tauri | Electron |
|---|---|---|
| Binary size / resource use | Small (system webview) | Large (bundles Chromium) |
| Attack surface | Rust core, minimal Node exposure to renderer | Full Node.js in main process by default |
| OS secure storage access | Native Rust crates (`windows` crate → DPAPI/Credential Manager) | Needs extra native modules |
| Auto-update, code signing | Built-in (`tauri-plugin-updater`) | Available via extra tooling |

Tauri's Rust backend is where all secret handling happens (decrypted credentials, OS
credential-store access); the React/TypeScript frontend never receives a plaintext secret
except transiently to hand to the WebView autofill call. See
[desktop-architecture.md](desktop-architecture.md).

## 7. Shared Contracts

`packages/types` defines the DTO/entity shapes; `packages/validation` defines Zod schemas
derived from those types. The NestJS `ValidationPipe` uses a Zod-to-class-validator bridge
(`nestjs-zod`) so the *same* schema validates requests server-side and forms client-side —
one definition of "what a valid Client looks like," not three.

## 8. Cross-Cutting Concerns (implemented once, in `common/` and `packages/`)

- Error format (see [api-design.md](api-design.md) §Error Format)
- Structured logging (Pino, redaction rules for the sensitive-field denylist)
- Rate limiting (`@nestjs/throttler`, Redis store)
- Idempotency keys for credential-mutating POSTs
- Correlation/request IDs propagated end-to-end (API → audit log → client error toasts)
