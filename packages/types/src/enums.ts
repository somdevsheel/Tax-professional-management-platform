/** Shared domain enums. Source of truth: docs/database-design.md. */

export const ENTITY_TYPES = [
  "INDIVIDUAL",
  "PROPRIETORSHIP",
  "PARTNERSHIP",
  "LLP",
  "PRIVATE_LIMITED",
  "PUBLIC_LIMITED",
  "TRUST",
  "SOCIETY",
  "HUF",
  "OTHER",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const CLIENT_STATUSES = ["ACTIVE", "INACTIVE", "ONBOARDING", "OFFBOARDED"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const COMPLIANCE_STATUSES = [
  "UPCOMING",
  "IN_PROGRESS",
  "FILED",
  "VERIFIED",
  "OVERDUE",
  "NOT_APPLICABLE",
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const CREDENTIAL_STATUSES = ["ACTIVE", "NEEDS_ROTATION", "REVOKED"] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const DOCUMENT_ACCESS_LEVELS = ["ORGANIZATION", "ASSIGNED_EMPLOYEES", "SPECIFIC_USERS"] as const;
export type DocumentAccessLevel = (typeof DOCUMENT_ACCESS_LEVELS)[number];

export const PORTAL_CODES = [
  "GST",
  "INCOME_TAX",
  "TRACES",
  "MCA",
  "EPFO",
  "ESIC",
  "DGFT",
] as const;
export type PortalCode = (typeof PORTAL_CODES)[number];

/** Audit event catalog. Source of truth: docs/security-design.md §8. Never carries plaintext secrets. */
export const AUDIT_ACTIONS = [
  "USER_LOGIN",
  "USER_LOGOUT",
  "LOGIN_FAILED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "ORGANIZATION_CREATED",
  "MEMBER_INVITED",
  "MEMBER_ROLE_CHANGED",
  "MEMBER_REMOVED",
  "CLIENT_CREATED",
  "CLIENT_UPDATED",
  "CLIENT_DELETED",
  "CLIENT_ASSIGNED",
  "CREDENTIAL_CREATED",
  "CREDENTIAL_UPDATED",
  "CREDENTIAL_ACCESSED",
  "CREDENTIAL_USED",
  "CREDENTIAL_REVEALED",
  "CREDENTIAL_ROTATED",
  "CREDENTIAL_DELETED",
  "PORTAL_OPENED",
  "PORTAL_SESSION_STARTED",
  "PORTAL_SESSION_COMPLETED",
  "PORTAL_SESSION_FAILED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_DOWNLOADED",
  "DOCUMENT_DELETED",
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_ASSIGNED",
  "TASK_COMPLETED",
  "TASK_DELETED",
  "COMPLIANCE_ITEM_CREATED",
  "COMPLIANCE_ITEM_UPDATED",
  "COMPLIANCE_STATUS_CHANGED",
  "COMPLIANCE_ITEM_DELETED",
  "AUDIT_LOG_VIEWED",
  "SETTINGS_CHANGED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
