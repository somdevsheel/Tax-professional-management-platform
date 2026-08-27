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
