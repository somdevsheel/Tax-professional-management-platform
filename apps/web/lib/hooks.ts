"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./api";
import { useAuth } from "./auth-context";

/** All query keys are namespaced by organizationId so switching firms never shows stale
 *  cached data from a different tenant (belt-and-suspenders on top of the backend's own
 *  tenant scoping — docs/security-design.md §3). */
function useOrgScope() {
  const { organizationId } = useAuth();
  return organizationId;
}

export function useClients(params: { status?: string; entityType?: string; search?: string }) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["clients", org, params],
    queryFn: () => apiClient.clients.list(params),
    enabled: !!org,
  });
}

export function useClient(id: string) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["client", org, id],
    queryFn: () => apiClient.clients.get(id),
    enabled: !!org && !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: apiClient.clients.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients", org] }),
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (body: Parameters<typeof apiClient.clients.update>[1]) => apiClient.clients.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", org] });
      qc.invalidateQueries({ queryKey: ["client", org, id] });
    },
  });
}

export function usePortalCatalog() {
  return useQuery({ queryKey: ["portal-catalog"], queryFn: apiClient.portals.catalog });
}

export function usePortalAccounts(clientId: string) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["portal-accounts", org, clientId],
    queryFn: () => apiClient.portals.listAccounts(clientId),
    enabled: !!org && !!clientId,
  });
}

export function useCreatePortalAccount(clientId: string) {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (vars: { portalId: string; identifier: string; displayUsername?: string }) =>
      apiClient.portals.createAccount(clientId, vars.portalId, vars.identifier, vars.displayUsername),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-accounts", org, clientId] });
      qc.invalidateQueries({ queryKey: ["client", org, clientId] });
    },
  });
}

export function useCredentials(portalAccountId: string) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["credentials", org, portalAccountId],
    queryFn: () => apiClient.credentials.list(portalAccountId),
    enabled: !!org && !!portalAccountId,
  });
}

export function useCreateCredential(portalAccountId: string) {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (vars: { username: string; password: string }) =>
      apiClient.credentials.create(portalAccountId, vars.username, vars.password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials", org, portalAccountId] }),
  });
}

export function useRotateCredential(portalAccountId: string) {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (vars: { id: string; username?: string; password?: string }) =>
      apiClient.credentials.rotate(vars.id, { username: vars.username, password: vars.password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials", org, portalAccountId] }),
  });
}

export function useDeleteCredential(portalAccountId: string) {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (id: string) => apiClient.credentials.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials", org, portalAccountId] }),
  });
}

export function useOrganizationMembers() {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["members", org],
    queryFn: apiClient.organizations.members,
    enabled: !!org,
  });
}

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: apiClient.roles.list });
}

export function useInviteMember() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (vars: { email: string; roleId: string }) => apiClient.organizations.invite(vars.email, vars.roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", org] }),
  });
}

export function useAuditLog(params?: { resourceType?: string }) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["audit-log", org, params],
    queryFn: () => apiClient.audit.list({ ...params, limit: 50 }),
    enabled: !!org,
  });
}

export function useCurrentOrganization() {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["organization", org],
    queryFn: apiClient.organizations.current,
    enabled: !!org,
  });
}

// ---- Tasks ----
export function useTasks(params: {
  status?: string;
  priority?: string;
  assignedTo?: string;
  clientId?: string;
  search?: string;
}) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["tasks", org, params],
    queryFn: () => apiClient.tasks.list(params),
    enabled: !!org,
  });
}

export function useTask(id: string) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["task", org, id],
    queryFn: () => apiClient.tasks.get(id),
    enabled: !!org && !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: apiClient.tasks.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", org] }),
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (body: Parameters<typeof apiClient.tasks.update>[1]) => apiClient.tasks.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", org] });
      qc.invalidateQueries({ queryKey: ["task", org, id] });
    },
  });
}

/** Takes the task id per-call (like useDeleteTask), not baked into the hook — a list page needs
 *  one mutation shared across many rows, each with its own id. */
export function useAssignTask() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (vars: { id: string; assignedTo: string | null }) => apiClient.tasks.assign(vars.id, vars.assignedTo),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks", org] });
      qc.invalidateQueries({ queryKey: ["task", org, vars.id] });
    },
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (id: string) => apiClient.tasks.complete(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["tasks", org] });
      qc.invalidateQueries({ queryKey: ["task", org, id] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (id: string) => apiClient.tasks.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", org] }),
  });
}

export function useTaskComments(id: string) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["task-comments", org, id],
    queryFn: () => apiClient.tasks.listComments(id),
    enabled: !!org && !!id,
  });
}

export function useAddTaskComment(id: string) {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (body: string) => apiClient.tasks.addComment(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", org, id] }),
  });
}

// ---- Compliance ----
export function useComplianceCatalog() {
  return useQuery({ queryKey: ["compliance-catalog"], queryFn: apiClient.compliance.catalog });
}

export function useComplianceItems(params: { status?: string; clientId?: string }) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["compliance-items", org, params],
    queryFn: () => apiClient.compliance.list(params),
    enabled: !!org,
  });
}

export function useCreateComplianceItem() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (vars: { clientId: string; body: Parameters<typeof apiClient.compliance.create>[1] }) =>
      apiClient.compliance.create(vars.clientId, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items", org] }),
  });
}

export function useUpdateComplianceItem() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (vars: { id: string; body: Parameters<typeof apiClient.compliance.update>[1] }) =>
      apiClient.compliance.update(vars.id, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items", org] }),
  });
}

export function useDeleteComplianceItem() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (id: string) => apiClient.compliance.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items", org] }),
  });
}

// ---- Documents ----
export function useDocumentCategories() {
  return useQuery({ queryKey: ["document-categories"], queryFn: apiClient.documents.categories });
}

export function useCreateDocumentCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: apiClient.documents.createCategory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["document-categories"] }),
  });
}

export function useDocuments(params: { clientId?: string; categoryId?: string; search?: string }) {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["documents", org, params],
    queryFn: () => apiClient.documents.list(params),
    enabled: !!org,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (vars: {
      file: File;
      clientId?: string;
      categoryId?: string;
      accessLevel?: string;
      tags?: string;
    }) =>
      vars.clientId
        ? apiClient.documents.uploadForClient(vars.clientId, vars.file, vars.file.name, vars)
        : apiClient.documents.upload(vars.file, vars.file.name, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", org] }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  const org = useOrgScope();
  return useMutation({
    mutationFn: (id: string) => apiClient.documents.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", org] }),
  });
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: (id: string) => apiClient.documents.getDownloadUrl(id),
  });
}

// ---- Reports ----
export function useReportsSummary() {
  const org = useOrgScope();
  return useQuery({
    queryKey: ["reports-summary", org],
    queryFn: apiClient.reports.summary,
    enabled: !!org,
  });
}
