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
