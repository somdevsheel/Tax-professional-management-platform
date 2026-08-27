import type { Permission } from "@tax-platform/types";
import { ApiError, type ApiErrorBody, type ApiSuccess } from "./types";
import type * as T from "./types";

export interface ApiClientOptions {
  baseUrl: string;
  /** "web" relies on the httpOnly refresh cookie; "desktop" carries the refresh token itself
   *  (docs/security-design.md §2 — different secure-storage story per client). */
  platform: "web" | "desktop";
  /** Called whenever a refresh attempt fails outright — the caller should treat this as "signed out". */
  onSessionExpired?: () => void;
  /**
   * Called after every successful token refresh (including ones triggered transparently by a
   * 401 retry, not just explicit `auth.refresh()` calls) with the new refresh token, if the
   * platform receives one in the body. Desktop uses this to keep OS-native secure storage in
   * sync with the rotated token (docs/security-design.md §2) without having to intercept every
   * call site itself. Web ignores this — its refresh token lives only in the httpOnly cookie.
   */
  onRefreshTokenRotated?: (refreshToken: string) => void;
}

/**
 * Thin typed wrapper over the REST API (docs/api-design.md). Owns access-token lifecycle
 * (in-memory only, never persisted — docs/security-design.md §2) and transparently retries a
 * request exactly once after a successful silent refresh. Shared between web and the future
 * desktop client so there is exactly one implementation of this contract to keep correct.
 */
export class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null; // desktop only
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Desktop only — web never sees the raw refresh token (docs/security-design.md §2). */
  setRefreshToken(token: string | null): void {
    this.refreshToken = token;
  }

  private async request<TResp>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { skipAuthRetry?: boolean; extraHeaders?: Record<string, string> },
  ): Promise<TResp> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Client-Platform": this.options.platform,
      ...opts?.extraHeaders,
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers,
      credentials: this.options.platform === "web" ? "include" : "omit",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && !opts?.skipAuthRetry && !path.startsWith("/auth/refresh")) {
      const newToken = await this.refreshOnce();
      if (newToken) {
        return this.request<TResp>(method, path, body, { ...opts, skipAuthRetry: true });
      }
      this.options.onSessionExpired?.();
    }

    const json = (await res.json().catch(() => null)) as ApiSuccess<TResp> | ApiErrorBody | null;
    if (!res.ok || !json || json.success === false) {
      const err = json as ApiErrorBody | null;
      throw new ApiError(
        err?.error?.code ?? "UNKNOWN_ERROR",
        err?.error?.message ?? `Request failed with status ${res.status}`,
        res.status,
        err?.error?.details,
      );
    }
    return (json as ApiSuccess<TResp>).data;
  }

  /** Same auth-retry shape as `request`, but for a multipart/form-data body (file uploads) —
   *  deliberately does not set Content-Type itself: fetch derives the correct
   *  `multipart/form-data; boundary=...` header from a FormData body, and setting it by hand
   *  would drop the boundary and break parsing on the server. */
  private async requestFormData<TResp>(
    method: string,
    path: string,
    formData: FormData,
    opts?: { skipAuthRetry?: boolean },
  ): Promise<TResp> {
    const headers: Record<string, string> = { "X-Client-Platform": this.options.platform };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers,
      credentials: this.options.platform === "web" ? "include" : "omit",
      body: formData,
    });

    if (res.status === 401 && !opts?.skipAuthRetry) {
      const newToken = await this.refreshOnce();
      if (newToken) {
        return this.requestFormData<TResp>(method, path, formData, { skipAuthRetry: true });
      }
      this.options.onSessionExpired?.();
    }

    const json = (await res.json().catch(() => null)) as ApiSuccess<TResp> | ApiErrorBody | null;
    if (!res.ok || !json || json.success === false) {
      const err = json as ApiErrorBody | null;
      throw new ApiError(
        err?.error?.code ?? "UNKNOWN_ERROR",
        err?.error?.message ?? `Request failed with status ${res.status}`,
        res.status,
        err?.error?.details,
      );
    }
    return (json as ApiSuccess<TResp>).data;
  }

  private async requestWithMeta<TResp>(
    method: string,
    path: string,
  ): Promise<{ data: TResp; meta?: ApiSuccess<TResp>["meta"] }> {
    const headers: Record<string, string> = {
      "X-Client-Platform": this.options.platform,
      ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
    };
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method,
      headers,
      credentials: this.options.platform === "web" ? "include" : "omit",
    });
    if (res.status === 401) {
      const newToken = await this.refreshOnce();
      if (newToken) return this.requestWithMeta<TResp>(method, path);
      this.options.onSessionExpired?.();
    }
    const json = (await res.json().catch(() => null)) as ApiSuccess<TResp> | ApiErrorBody | null;
    if (!res.ok || !json || json.success === false) {
      const err = json as ApiErrorBody | null;
      throw new ApiError(err?.error?.code ?? "UNKNOWN_ERROR", err?.error?.message ?? "Request failed", res.status);
    }
    return { data: (json as ApiSuccess<TResp>).data, meta: (json as ApiSuccess<TResp>).meta };
  }

  private async refreshOnce(): Promise<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<string | null> {
    try {
      const body = this.options.platform === "desktop" && this.refreshToken
        ? { refreshToken: this.refreshToken }
        : {};
      const res = await fetch(`${this.options.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Platform": this.options.platform },
        credentials: this.options.platform === "web" ? "include" : "omit",
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as ApiSuccess<T.AuthResult>;
      this.accessToken = json.data.accessToken;
      if (json.data.refreshToken) {
        this.refreshToken = json.data.refreshToken;
        this.options.onRefreshTokenRotated?.(json.data.refreshToken);
      }
      return this.accessToken;
    } catch {
      return null;
    }
  }

  // ---- Auth ----
  auth = {
    register: (body: {
      email: string;
      password: string;
      fullName: string;
      organizationName: string;
      organizationSlug: string;
    }) => this.request<T.AuthResult>("POST", "/auth/register", body),
    login: (body: { email: string; password: string }) =>
      this.request<T.AuthResult>("POST", "/auth/login", body),
    logout: () => this.request<null>("POST", "/auth/logout"),
    forgotPassword: (email: string) =>
      this.request<{ message: string }>("POST", "/auth/forgot-password", { email }),
    resetPassword: (token: string, newPassword: string) =>
      this.request<null>("POST", "/auth/reset-password", { token, newPassword }),
    switchOrganization: (organizationId: string) =>
      this.request<{ accessToken: string; expiresIn: number }>("POST", "/auth/switch-organization", {
        organizationId,
      }),
    me: () => this.request<T.MeResult>("GET", "/auth/me"),
    refresh: () => this.refreshOnce(),
  };

  // ---- Organizations ----
  organizations = {
    current: () => this.request<T.Organization>("GET", "/organizations/current"),
    members: () => this.request<T.OrganizationMember[]>("GET", "/organizations/current/members"),
    invite: (email: string, roleId: string) =>
      this.request<T.OrganizationMember>("POST", "/organizations/current/members/invite", { email, roleId }),
    changeRole: (memberId: string, roleId: string) =>
      this.request<T.OrganizationMember>("PATCH", `/organizations/current/members/${memberId}`, { roleId }),
    removeMember: (memberId: string) =>
      this.request<T.OrganizationMember>("DELETE", `/organizations/current/members/${memberId}`),
  };

  roles = {
    list: () => this.request<Array<{ id: string; name: string }>>("GET", "/roles"),
    permissions: () => this.request<Array<{ id: string; code: Permission; category: string }>>("GET", "/permissions"),
  };

  // ---- Clients ----
  clients = {
    list: (params?: {
      status?: string;
      entityType?: string;
      search?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.entityType) qs.set("entityType", params.entityType);
      if (params?.search) qs.set("search", params.search);
      if (params?.cursor) qs.set("cursor", params.cursor);
      if (params?.limit) qs.set("limit", String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return this.requestWithMeta<T.Client[]>("GET", `/clients${suffix}`);
    },
    get: (id: string) => this.request<T.ClientDetail>("GET", `/clients/${id}`),
    create: (body: T.CreateClientInput) => this.request<T.Client>("POST", "/clients", body),
    update: (id: string, body: T.UpdateClientInput) => this.request<T.Client>("PATCH", `/clients/${id}`, body),
    remove: (id: string) => this.request<null>("DELETE", `/clients/${id}`),
    addContact: (id: string, body: { name: string; role?: string; email?: string; phone?: string; isPrimary?: boolean }) =>
      this.request<T.ClientContact>("POST", `/clients/${id}/contacts`, body),
    assign: (id: string, organizationMemberId: string, assignedRole?: string) =>
      this.request("POST", `/clients/${id}/assignments`, { organizationMemberId, assignedRole }),
    unassign: (id: string, assignmentId: string) =>
      this.request<null>("DELETE", `/clients/${id}/assignments/${assignmentId}`),
  };

  // ---- Portals ----
  portals = {
    catalog: () => this.request<T.Portal[]>("GET", "/portals"),
    listAccounts: (clientId: string) => this.request<T.PortalAccount[]>("GET", `/clients/${clientId}/portal-accounts`),
    createAccount: (clientId: string, portalId: string, identifier: string, displayUsername?: string) =>
      this.request<T.PortalAccount>("POST", `/clients/${clientId}/portal-accounts`, {
        portalId,
        identifier,
        displayUsername,
      }),
  };

  // ---- Credentials ----
  credentials = {
    list: (portalAccountId: string) =>
      this.request<T.CredentialMetadata[]>("GET", `/portal-accounts/${portalAccountId}/credentials`),
    create: (portalAccountId: string, username: string, password: string) =>
      this.request<T.CredentialMetadata>("POST", `/portal-accounts/${portalAccountId}/credentials`, {
        username,
        password,
      }),
    rotate: (id: string, body: { username?: string; password?: string }) =>
      this.request<T.CredentialMetadata>("PATCH", `/credentials/${id}`, body),
    remove: (id: string) => this.request<null>("DELETE", `/credentials/${id}`),
    reveal: (id: string, currentPassword: string) =>
      this.request<T.CredentialPlaintext>("POST", `/credentials/${id}/reveal`, { currentPassword }),
  };

  // ---- Portal sessions ----
  portalSessions = {
    create: (clientId: string, portalAccountId: string) =>
      this.request<T.PortalSession>("POST", "/portal-sessions", { clientId, portalAccountId }),
    get: (id: string) => this.request<T.PortalSessionDetail>("GET", `/portal-sessions/${id}`),
    /** Lifecycle event types mirror docs/browser-automation-design.md §5's state machine. */
    reportEvent: (id: string, type: T.PortalSessionEventType) =>
      this.request<null>("POST", `/portal-sessions/${id}/events`, { type }),
  };

  // ---- Tasks ----
  tasks = {
    list: (params?: {
      status?: string;
      priority?: string;
      assignedTo?: string;
      clientId?: string;
      dueBefore?: string;
      dueAfter?: string;
      search?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.priority) qs.set("priority", params.priority);
      if (params?.assignedTo) qs.set("assignedTo", params.assignedTo);
      if (params?.clientId) qs.set("clientId", params.clientId);
      if (params?.dueBefore) qs.set("dueBefore", params.dueBefore);
      if (params?.dueAfter) qs.set("dueAfter", params.dueAfter);
      if (params?.search) qs.set("search", params.search);
      if (params?.cursor) qs.set("cursor", params.cursor);
      if (params?.limit) qs.set("limit", String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return this.requestWithMeta<T.Task[]>("GET", `/tasks${suffix}`);
    },
    get: (id: string) => this.request<T.TaskDetail>("GET", `/tasks/${id}`),
    create: (body: T.CreateTaskInput) => this.request<T.Task>("POST", "/tasks", body),
    update: (id: string, body: T.UpdateTaskInput) => this.request<T.Task>("PATCH", `/tasks/${id}`, body),
    assign: (id: string, assignedTo: string | null) =>
      this.request<T.Task>("PATCH", `/tasks/${id}/assign`, { assignedTo }),
    complete: (id: string) => this.request<T.Task>("POST", `/tasks/${id}/complete`),
    remove: (id: string) => this.request<null>("DELETE", `/tasks/${id}`),
    listComments: (id: string) => this.request<T.TaskComment[]>("GET", `/tasks/${id}/comments`),
    addComment: (id: string, body: string) =>
      this.request<T.TaskComment>("POST", `/tasks/${id}/comments`, { body }),
  };

  // ---- Compliance ----
  compliance = {
    catalog: () => this.request<T.ComplianceType[]>("GET", "/compliance-types"),
    list: (params?: {
      status?: string;
      clientId?: string;
      complianceTypeId?: string;
      dueBefore?: string;
      dueAfter?: string;
      cursor?: string;
      limit?: number;
    }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.clientId) qs.set("clientId", params.clientId);
      if (params?.complianceTypeId) qs.set("complianceTypeId", params.complianceTypeId);
      if (params?.dueBefore) qs.set("dueBefore", params.dueBefore);
      if (params?.dueAfter) qs.set("dueAfter", params.dueAfter);
      if (params?.cursor) qs.set("cursor", params.cursor);
      if (params?.limit) qs.set("limit", String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return this.requestWithMeta<T.ComplianceItem[]>("GET", `/compliance-items${suffix}`);
    },
    get: (id: string) => this.request<T.ComplianceItem>("GET", `/compliance-items/${id}`),
    listForClient: (clientId: string) =>
      this.request<T.ComplianceItem[]>("GET", `/clients/${clientId}/compliance-items`),
    create: (clientId: string, body: T.CreateComplianceItemInput) =>
      this.request<T.ComplianceItem>("POST", `/clients/${clientId}/compliance-items`, body),
    update: (id: string, body: T.UpdateComplianceItemInput) =>
      this.request<T.ComplianceItem>("PATCH", `/compliance-items/${id}`, body),
    remove: (id: string) => this.request<null>("DELETE", `/compliance-items/${id}`),
  };

  // ---- Documents ----
  documents = {
    categories: () => this.request<T.DocumentCategory[]>("GET", "/document-categories"),
    createCategory: (body: { name: string; parentId?: string }) =>
      this.request<T.DocumentCategory>("POST", "/document-categories", body),
    list: (params?: { clientId?: string; categoryId?: string; tag?: string; search?: string; cursor?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.clientId) qs.set("clientId", params.clientId);
      if (params?.categoryId) qs.set("categoryId", params.categoryId);
      if (params?.tag) qs.set("tag", params.tag);
      if (params?.search) qs.set("search", params.search);
      if (params?.cursor) qs.set("cursor", params.cursor);
      if (params?.limit) qs.set("limit", String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return this.requestWithMeta<T.DocumentMetadata[]>("GET", `/documents${suffix}`);
    },
    get: (id: string) => this.request<T.DocumentMetadata>("GET", `/documents/${id}`),
    getDownloadUrl: (id: string) => this.request<{ url: string }>("GET", `/documents/${id}/download`),
    remove: (id: string) => this.request<null>("DELETE", `/documents/${id}`),
    listForClient: (clientId: string) => this.request<T.DocumentMetadata[]>("GET", `/clients/${clientId}/documents`),
    /** file is a browser File/Blob (web) or an equivalent Blob-like value (desktop) — never
     *  read into this client's own memory as a Buffer; it's handed straight to FormData/fetch. */
    upload: (file: Blob, fileName: string, opts?: { categoryId?: string; accessLevel?: string; tags?: string }) => {
      const formData = new FormData();
      formData.append("file", file, fileName);
      if (opts?.categoryId) formData.append("categoryId", opts.categoryId);
      if (opts?.accessLevel) formData.append("accessLevel", opts.accessLevel);
      if (opts?.tags) formData.append("tags", opts.tags);
      return this.requestFormData<T.DocumentMetadata>("POST", "/documents", formData);
    },
    uploadForClient: (
      clientId: string,
      file: Blob,
      fileName: string,
      opts?: { categoryId?: string; accessLevel?: string; tags?: string },
    ) => {
      const formData = new FormData();
      formData.append("file", file, fileName);
      if (opts?.categoryId) formData.append("categoryId", opts.categoryId);
      if (opts?.accessLevel) formData.append("accessLevel", opts.accessLevel);
      if (opts?.tags) formData.append("tags", opts.tags);
      return this.requestFormData<T.DocumentMetadata>("POST", `/clients/${clientId}/documents`, formData);
    },
  };

  // ---- Reports ----
  reports = {
    summary: () => this.request<T.ReportsSummary>("GET", "/reports/summary"),
  };

  // ---- Audit ----
  audit = {
    list: (params?: { resourceType?: string; resourceId?: string; cursor?: string; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.resourceType) qs.set("resourceType", params.resourceType);
      if (params?.resourceId) qs.set("resourceId", params.resourceId);
      if (params?.cursor) qs.set("cursor", params.cursor);
      if (params?.limit) qs.set("limit", String(params.limit));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return this.requestWithMeta<T.AuditLogEntry[]>("GET", `/audit-logs${suffix}`);
    },
  };
}
