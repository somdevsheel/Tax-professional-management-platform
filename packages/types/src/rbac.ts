/**
 * RBAC contracts shared across api / web / desktop.
 * Source of truth: docs/database-design.md §RBAC, docs/security-design.md §4.
 */

/** Seeded system roles. Firms may define custom roles later; this list is not exhaustive. */
export const SYSTEM_ROLES = [
  "SUPER_ADMIN",
  "FIRM_ADMIN",
  "CA",
  "MANAGER",
  "ACCOUNTANT",
  "STAFF",
  "READ_ONLY",
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Permission codes. Stored as data in the `permissions` table; this const is the typed mirror. */
export const PERMISSIONS = [
  "clients.view",
  "clients.create",
  "clients.update",
  "clients.delete",
  "credentials.view",
  "credentials.create",
  "credentials.update",
  "credentials.delete",
  "credentials.use",
  "credentials.reveal",
  "documents.view",
  "documents.upload",
  "documents.delete",
  "tasks.view",
  "tasks.create",
  "tasks.assign",
  "tasks.complete",
  "compliance.view",
  "compliance.manage",
  "employees.manage",
  "reports.view",
  "audit_logs.view",
  "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Default permission grants for each seeded system role. Seed data mirrors this exactly. */
export const DEFAULT_ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  FIRM_ADMIN: PERMISSIONS,
  CA: [
    "clients.view", "clients.create", "clients.update",
    "credentials.view", "credentials.create", "credentials.update", "credentials.use", "credentials.reveal",
    "documents.view", "documents.upload", "documents.delete",
    "tasks.view", "tasks.create", "tasks.assign", "tasks.complete",
    "compliance.view", "compliance.manage",
    "employees.manage", "reports.view", "audit_logs.view",
  ],
  MANAGER: [
    "clients.view", "clients.create", "clients.update",
    "credentials.view", "credentials.create", "credentials.update", "credentials.use",
    "documents.view", "documents.upload", "documents.delete",
    "tasks.view", "tasks.create", "tasks.assign", "tasks.complete",
    "compliance.view", "compliance.manage", "reports.view",
  ],
  ACCOUNTANT: [
    "clients.view", "clients.update",
    "credentials.view", "credentials.use",
    "documents.view", "documents.upload",
    "tasks.view", "tasks.create", "tasks.complete",
    "compliance.view", "compliance.manage",
  ],
  STAFF: [
    "clients.view",
    "credentials.view", "credentials.use",
    "documents.view", "documents.upload",
    "tasks.view", "tasks.complete",
    "compliance.view",
  ],
  READ_ONLY: ["clients.view", "documents.view", "tasks.view", "compliance.view", "reports.view"],
};
