import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./api";
import { useAuth } from "./auth-context";

export function useClients(params: { search?: string; status?: string }) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["clients", organizationId, params],
    queryFn: () => apiClient.clients.list({ search: params.search || undefined, status: params.status || undefined, limit: 100 }),
    enabled: !!organizationId,
  });
}

export function useClient(id: string) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["client", organizationId, id],
    queryFn: () => apiClient.clients.get(id),
    enabled: !!organizationId && !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: apiClient.clients.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients", organizationId] }),
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (body: Parameters<typeof apiClient.clients.update>[1]) => apiClient.clients.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients", organizationId] });
      qc.invalidateQueries({ queryKey: ["client", organizationId, id] });
    },
  });
}

export function usePortalAccounts(clientId: string) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["portal-accounts", organizationId, clientId],
    queryFn: () => apiClient.portals.listAccounts(clientId),
    enabled: !!organizationId && !!clientId,
  });
}

export function useCreatePortalAccount(clientId: string) {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (vars: { portalId: string; identifier: string; displayUsername?: string }) =>
      apiClient.portals.createAccount(clientId, vars.portalId, vars.identifier, vars.displayUsername),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-accounts", organizationId, clientId] });
      qc.invalidateQueries({ queryKey: ["client", organizationId, clientId] });
    },
  });
}

// Credential management — same shape as apps/web/lib/hooks.ts, so the desktop app has the
// same Reveal/Rotate/Delete/status capability the web app does, not just the portal launcher.
export function useCredentials(portalAccountId: string) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["credentials", organizationId, portalAccountId],
    queryFn: () => apiClient.credentials.list(portalAccountId),
    enabled: !!organizationId && !!portalAccountId,
  });
}

export function useCreateCredential(portalAccountId: string) {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (vars: { username: string; password: string }) =>
      apiClient.credentials.create(portalAccountId, vars.username, vars.password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials", organizationId, portalAccountId] }),
  });
}

export function useRotateCredential(portalAccountId: string) {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (vars: { id: string; username?: string; password?: string }) =>
      apiClient.credentials.rotate(vars.id, { username: vars.username, password: vars.password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials", organizationId, portalAccountId] }),
  });
}

export function useDeleteCredential(portalAccountId: string) {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (id: string) => apiClient.credentials.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["credentials", organizationId, portalAccountId] }),
  });
}

// The rest of the web app's sidebar — Dashboard, Portals, Employees, Activity, Settings —
// same hooks as apps/web/lib/hooks.ts, so the desktop app isn't just a launcher with a client
// list bolted on.
export function usePortalCatalog() {
  return useQuery({ queryKey: ["portal-catalog"], queryFn: apiClient.portals.catalog });
}

export function useOrganizationMembers() {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["members", organizationId],
    queryFn: apiClient.organizations.members,
    enabled: !!organizationId,
  });
}

export function useRoles() {
  return useQuery({ queryKey: ["roles"], queryFn: apiClient.roles.list });
}

export function useInviteMember() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (vars: { email: string; roleId: string }) => apiClient.organizations.invite(vars.email, vars.roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", organizationId] }),
  });
}

export function useAuditLog(params?: { resourceType?: string }) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["audit-log", organizationId, params],
    queryFn: () => apiClient.audit.list({ ...params, limit: 50 }),
    enabled: !!organizationId,
  });
}

export function useCurrentOrganization() {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["organization", organizationId],
    queryFn: apiClient.organizations.current,
    enabled: !!organizationId,
  });
}

// ---- Tasks — same shape as apps/web/lib/hooks.ts ----
export function useTasks(params: { status?: string; priority?: string; assignedTo?: string; clientId?: string }) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["tasks", organizationId, params],
    queryFn: () => apiClient.tasks.list(params),
    enabled: !!organizationId,
  });
}

export function useTask(id: string) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["task", organizationId, id],
    queryFn: () => apiClient.tasks.get(id),
    enabled: !!organizationId && !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: apiClient.tasks.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", organizationId] }),
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (body: Parameters<typeof apiClient.tasks.update>[1]) => apiClient.tasks.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", organizationId] });
      qc.invalidateQueries({ queryKey: ["task", organizationId, id] });
    },
  });
}

export function useAssignTask() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (vars: { id: string; assignedTo: string | null }) => apiClient.tasks.assign(vars.id, vars.assignedTo),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks", organizationId] });
      qc.invalidateQueries({ queryKey: ["task", organizationId, vars.id] });
    },
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (id: string) => apiClient.tasks.complete(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["tasks", organizationId] });
      qc.invalidateQueries({ queryKey: ["task", organizationId, id] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (id: string) => apiClient.tasks.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", organizationId] }),
  });
}

export function useTaskComments(id: string) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["task-comments", organizationId, id],
    queryFn: () => apiClient.tasks.listComments(id),
    enabled: !!organizationId && !!id,
  });
}

export function useAddTaskComment(id: string) {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (body: string) => apiClient.tasks.addComment(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", organizationId, id] }),
  });
}

// ---- Compliance — same shape as apps/web/lib/hooks.ts ----
export function useComplianceCatalog() {
  return useQuery({ queryKey: ["compliance-catalog"], queryFn: apiClient.compliance.catalog });
}

export function useComplianceItems(params: { status?: string; clientId?: string }) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["compliance-items", organizationId, params],
    queryFn: () => apiClient.compliance.list(params),
    enabled: !!organizationId,
  });
}

export function useCreateComplianceItem() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (vars: { clientId: string; body: Parameters<typeof apiClient.compliance.create>[1] }) =>
      apiClient.compliance.create(vars.clientId, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items", organizationId] }),
  });
}

export function useUpdateComplianceItem() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (vars: { id: string; body: Parameters<typeof apiClient.compliance.update>[1] }) =>
      apiClient.compliance.update(vars.id, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items", organizationId] }),
  });
}

export function useDeleteComplianceItem() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (id: string) => apiClient.compliance.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-items", organizationId] }),
  });
}

// ---- Documents — same shape as apps/web/lib/hooks.ts ----
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
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["documents", organizationId, params],
    queryFn: () => apiClient.documents.list(params),
    enabled: !!organizationId,
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (vars: { file: File; clientId?: string; categoryId?: string; accessLevel?: string; tags?: string }) =>
      vars.clientId
        ? apiClient.documents.uploadForClient(vars.clientId, vars.file, vars.file.name, vars)
        : apiClient.documents.upload(vars.file, vars.file.name, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", organizationId] }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  const { organizationId } = useAuth();
  return useMutation({
    mutationFn: (id: string) => apiClient.documents.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents", organizationId] }),
  });
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: (id: string) => apiClient.documents.getDownloadUrl(id),
  });
}

// ---- Reports ----
export function useReportsSummary() {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["reports-summary", organizationId],
    queryFn: apiClient.reports.summary,
    enabled: !!organizationId,
  });
}
