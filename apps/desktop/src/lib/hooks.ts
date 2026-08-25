import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./api";
import { useAuth } from "./auth-context";

export function useClients(search: string) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["clients", organizationId, search],
    queryFn: () => apiClient.clients.list({ search: search || undefined, limit: 100 }),
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

export function usePortalAccounts(clientId: string) {
  const { organizationId } = useAuth();
  return useQuery({
    queryKey: ["portal-accounts", organizationId, clientId],
    queryFn: () => apiClient.portals.listAccounts(clientId),
    enabled: !!organizationId && !!clientId,
  });
}
