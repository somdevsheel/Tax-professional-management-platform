# API Design

REST over HTTPS, JSON bodies, versioned at the path root (`/api/v1/...`) from day one so
breaking changes don't require a flag day. OpenAPI 3 spec auto-generated from NestJS
decorators (`@nestjs/swagger`) and published at `/api/docs` (disabled in production, or gated
behind auth) and exported to `packages/api-client` for typed client generation.

## 1. Conventions

- Resource-oriented URLs, plural nouns: `/clients`, `/tasks`, `/documents`.
- Standard verbs: `GET` list/read, `POST` create, `PATCH` partial update, `DELETE` soft-delete.
- Pagination: cursor-based (`?cursor=...&limit=50`) for large/activity-style lists
  (`audit-logs`, `notifications`); offset (`?page=&pageSize=`) acceptable for small bounded
  lists (`clients` within a firm). Response envelope includes `meta: { nextCursor, hasMore }`.
- Filtering: explicit query params per resource (`?status=active&assignedTo=<id>`), not a
  generic query language, to keep authorization checks reviewable per endpoint.
- All timestamps ISO 8601 UTC. All monetary/identifier fields as strings (avoid float
  precision issues, preserve leading zeros in e.g. TAN-adjacent numeric-looking fields).

## 2. Auth Endpoints

```
POST   /api/v1/auth/register            create user + first organization (firm signup)
POST   /api/v1/auth/login               email+password -> access + refresh token
POST   /api/v1/auth/refresh             rotate refresh token -> new access token
POST   /api/v1/auth/logout              revoke current session
POST   /api/v1/auth/logout-all          revoke all sessions for the user
POST   /api/v1/auth/password/forgot
POST   /api/v1/auth/password/reset
POST   /api/v1/auth/email/verify
GET    /api/v1/auth/me                  current user + org memberships
POST   /api/v1/auth/switch-organization change active org context (multi-firm membership)
```

## 3. Organizations & Members

```
GET    /api/v1/organizations/current
PATCH  /api/v1/organizations/current
GET    /api/v1/organizations/current/members
POST   /api/v1/organizations/current/members/invite
PATCH  /api/v1/organizations/current/members/:id      (role change, status)
DELETE /api/v1/organizations/current/members/:id
GET    /api/v1/roles
GET    /api/v1/permissions
```

## 4. Clients

```
GET    /api/v1/clients                  ?status=&entityType=&assignedTo=&search=
POST   /api/v1/clients
GET    /api/v1/clients/:id
PATCH  /api/v1/clients/:id
DELETE /api/v1/clients/:id
POST   /api/v1/clients/:id/contacts
GET    /api/v1/clients/:id/contacts
POST   /api/v1/clients/:id/assignments
DELETE /api/v1/clients/:id/assignments/:assignmentId
GET    /api/v1/clients/:id/portals              portal_accounts for this client
GET    /api/v1/clients/:id/activity             recent audit events for this client
```

## 5. Portals & Credentials

```
GET    /api/v1/portals                          global portal catalog
GET    /api/v1/clients/:id/portal-accounts
POST   /api/v1/clients/:id/portal-accounts
PATCH  /api/v1/portal-accounts/:id
GET    /api/v1/portal-accounts/:id/credentials  (metadata only, never plaintext)
POST   /api/v1/portal-accounts/:id/credentials
PATCH  /api/v1/credentials/:id                  rotate
DELETE /api/v1/credentials/:id
POST   /api/v1/credentials/:id/reveal           step-up auth required; may be disabled org-wide

POST   /api/v1/portal-sessions                  { clientId, portalAccountId } -> session + one-time credential token
GET    /api/v1/portal-sessions/:id
GET    /api/v1/portal-sessions/:id/credential    one-time use, desktop-only, short TTL
POST   /api/v1/portal-sessions/:id/events        desktop reports lifecycle events (opened, username_filled, awaiting_challenge, completed, failed)
```

## 6. Documents

```
GET    /api/v1/documents                ?clientId=&categoryId=&tags=
POST   /api/v1/documents                multipart upload -> presigned flow (see below)
GET    /api/v1/documents/:id
GET    /api/v1/documents/:id/download   short-lived signed URL
DELETE /api/v1/documents/:id
GET    /api/v1/document-categories
```

Upload flow: `POST /documents` returns a presigned PUT URL + a pending `document` record; the
client uploads bytes directly to object storage; a completion callback
(`POST /documents/:id/complete`) verifies checksum/size and flips status to `available` after
the AV-scan worker clears it. This keeps large file bytes off the API process entirely.

## 7. Tasks

```
GET    /api/v1/tasks                    ?status=&priority=&assignedTo=&clientId=&dueBefore=
POST   /api/v1/tasks
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id
DELETE /api/v1/tasks/:id
POST   /api/v1/tasks/:id/comments
POST   /api/v1/tasks/:id/complete
```

## 8. Compliance

```
GET    /api/v1/compliance-types
GET    /api/v1/clients/:id/compliance-items     ?financialYear=&status=
POST   /api/v1/clients/:id/compliance-items
PATCH  /api/v1/compliance-items/:id
```

## 9. Notifications, Audit, Search

```
GET    /api/v1/notifications            ?unread=true
PATCH  /api/v1/notifications/:id/read
GET    /api/v1/audit-logs               ?resourceType=&resourceId=&actorId=&from=&to=
GET    /api/v1/search?q=...             federated search across clients/tasks/documents/employees
GET    /api/v1/health
GET    /api/v1/health/ready
```

## 10. Response & Error Format

Success:

```json
{ "success": true, "data": { ... }, "meta": { "nextCursor": null } }
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "CLIENT_NOT_FOUND",
    "message": "Client was not found",
    "requestId": "3f1c...e2"
  }
}
```

- `code` is a stable machine-readable enum (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`,
  `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, plus domain-specific codes like
  `CLIENT_NOT_FOUND`, `CREDENTIAL_REVEAL_DISABLED`).
- Stack traces and internal error detail never reach the response body in production; full
  detail goes to structured server logs keyed by `requestId`, which the client can surface to
  support without exposing internals.
- Validation errors include a `details: [{ field, message }]` array.

## 11. Versioning & Compatibility

Additive changes (new optional fields) ship without a version bump. Breaking changes get a new
`/api/v2` path prefix, with `v1` maintained on a deprecation timeline communicated to desktop
users (who can't force-refresh like a web app) via the `/auth/me` response's
`minimumDesktopVersion` field, checked at desktop app startup.
