import type {
  AuditAction,
  ClientStatus,
  ComplianceStatus,
  CredentialStatus,
  DocumentAccessLevel,
  EntityType,
  TaskPriority,
  TaskStatus,
} from "@tax-platform/types";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { nextCursor?: string | null; hasMore?: boolean; total?: number };
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; requestId?: string; details?: Array<{ field: string; message: string }> };
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

export interface AuthResult {
  user: AuthUser;
  organizationId: string | null;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  organizations?: string[];
}

export interface Membership {
  organizationId: string;
  organizationName: string;
  role: string;
}

export interface MeResult {
  user: AuthUser & { status: string; mfaEnabled: boolean };
  memberships: Membership[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  roleId: string;
  status: string;
  joinedAt: string | null;
  user: { id: string; email: string; fullName: string };
  role: { id: string; name: string };
}

export interface Client {
  id: string;
  organizationId: string;
  name: string;
  entityType: EntityType;
  pan: string | null;
  gstin: string | null;
  tan: string | null;
  cin: string | null;
  email: string | null;
  phone: string | null;
  contactPerson: string | null;
  financialYear: string | null;
  assessmentYear: string | null;
  status: ClientStatus;
  notes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Loosely-typed write shapes for forms — deliberately not `Partial<Client>`, since a form's
 *  entityType/status fields are plain strings until the backend validates them. */
export interface CreateClientInput {
  name: string;
  entityType: string;
  pan?: string;
  gstin?: string;
  tan?: string;
  cin?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  financialYear?: string;
  assessmentYear?: string;
  status?: string;
  notes?: string;
  tags?: string[];
}

export type UpdateClientInput = Partial<CreateClientInput>;

export interface ClientContact {
  id: string;
  clientId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

export interface ClientDetail extends Client {
  contacts: ClientContact[];
  assignments: Array<{
    id: string;
    organizationMemberId: string;
    assignedRole: string | null;
    member: { user: { id: string; fullName: string; email: string } };
  }>;
  portalAccounts: PortalAccount[];
}

export interface Portal {
  id: string;
  code: string;
  name: string;
  category: string;
  baseUrl: string;
  loginUrl: string;
  isActive: boolean;
}

export interface PortalAccount {
  id: string;
  organizationId: string;
  clientId: string;
  portalId: string;
  identifier: string;
  displayUsername: string | null;
  status: string;
  portal: Portal;
  credentials?: Array<{ id: string; status: CredentialStatus }>;
}

export interface CredentialMetadata {
  id: string;
  portalAccountId: string;
  status: CredentialStatus;
  lastUsedAt: string | null;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialPlaintext {
  username: string;
  password: string;
}

export interface PortalSession {
  id: string;
  oneTimeToken: string;
  expiresAt: string;
}

export const PORTAL_SESSION_EVENT_TYPES = [
  "opened",
  "navigating_to_login",
  "username_filled",
  "password_filled",
  "awaiting_user_challenge",
  "completed",
  "failed",
] as const;
export type PortalSessionEventType = (typeof PORTAL_SESSION_EVENT_TYPES)[number];

export interface PortalSessionDetail {
  id: string;
  status: string;
  expiresAt: string;
  events: Array<{ id: string; type: string; createdAt: string }>;
}

export interface Task {
  id: string;
  organizationId: string;
  clientId: string | null;
  portalAccountId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assignedTo: string | null;
  createdById: string;
  parentTaskId: string | null;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; name: string } | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface TaskDetail extends Task {
  comments: TaskComment[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  clientId?: string;
  portalAccountId?: string;
  priority?: string;
  dueDate?: string;
  assignedTo?: string;
  parentTaskId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  clientId?: string;
  portalAccountId?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
}

export interface ComplianceType {
  id: string;
  organizationId: string | null;
  code: string;
  name: string;
  category: string;
  periodicity: string;
}

export interface ComplianceItem {
  id: string;
  organizationId: string;
  clientId: string;
  complianceTypeId: string;
  financialYear: string;
  assessmentYear: string | null;
  dueDate: string;
  filingDate: string | null;
  status: ComplianceStatus;
  assignedTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; name: string };
  complianceType?: ComplianceType;
}

export interface CreateComplianceItemInput {
  complianceTypeId: string;
  financialYear: string;
  assessmentYear?: string;
  dueDate: string;
  assignedTo?: string;
  notes?: string;
}

export interface UpdateComplianceItemInput {
  dueDate?: string;
  filingDate?: string;
  status?: string;
  assignedTo?: string;
  notes?: string;
}

export interface DocumentCategory {
  id: string;
  organizationId: string | null;
  name: string;
  parentId: string | null;
}

export interface DocumentMetadata {
  id: string;
  organizationId: string;
  clientId: string | null;
  categoryId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  tags: string[];
  uploadedById: string;
  accessLevel: DocumentAccessLevel;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; name: string } | null;
  category?: DocumentCategory | null;
}

export interface ReportsSummary {
  clients: { total: number; byStatus: Record<string, number> };
  tasks: { total: number; byStatus: Record<string, number>; byPriority: Record<string, number>; overdueCount: number };
  compliance: { total: number; byStatus: Record<string, number>; overdueCount: number; dueNext30DaysCount: number };
  documents: { total: number; totalSizeBytes: number };
}

export interface AuditLogEntry {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  result: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
