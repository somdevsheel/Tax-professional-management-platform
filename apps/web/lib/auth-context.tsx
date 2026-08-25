"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser, Membership } from "@tax-platform/api-client";
import { apiClient } from "./api";
import { decodeAccessTokenOrgId } from "./jwt";

type Status = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: Status;
  user: AuthUser | null;
  organizationId: string | null;
  memberships: Membership[];
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (fields: {
    email: string;
    password: string;
    fullName: string;
    organizationName: string;
    organizationSlug: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  refetchMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const initialState: AuthState = { status: "loading", user: null, organizationId: null, memberships: [] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  const hydrateMemberships = useCallback(async (user: AuthUser, organizationId: string | null) => {
    try {
      const me = await apiClient.auth.me();
      setState({ status: "authenticated", user, organizationId, memberships: me.memberships });
    } catch {
      setState({ status: "authenticated", user, organizationId, memberships: [] });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await apiClient.auth.refresh();
      if (cancelled) return;
      if (!token) {
        setState({ status: "unauthenticated", user: null, organizationId: null, memberships: [] });
        return;
      }
      try {
        const me = await apiClient.auth.me();
        if (cancelled) return;
        setState({
          status: "authenticated",
          user: { id: me.user.id, email: me.user.email, fullName: me.user.fullName },
          organizationId: decodeAccessTokenOrgId(token),
          memberships: me.memberships,
        });
      } catch {
        if (!cancelled) setState({ status: "unauthenticated", user: null, organizationId: null, memberships: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiClient.auth.login({ email, password });
      apiClient.setAccessToken(result.accessToken);
      await hydrateMemberships(result.user, result.organizationId);
    },
    [hydrateMemberships],
  );

  const register = useCallback(
    async (fields: {
      email: string;
      password: string;
      fullName: string;
      organizationName: string;
      organizationSlug: string;
    }) => {
      const result = await apiClient.auth.register(fields);
      apiClient.setAccessToken(result.accessToken);
      await hydrateMemberships(result.user, result.organizationId);
    },
    [hydrateMemberships],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.auth.logout();
    } finally {
      apiClient.setAccessToken(null);
      setState({ status: "unauthenticated", user: null, organizationId: null, memberships: [] });
    }
  }, []);

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      const result = await apiClient.auth.switchOrganization(organizationId);
      apiClient.setAccessToken(result.accessToken);
      setState((prev) => ({ ...prev, organizationId }));
    },
    [],
  );

  const refetchMemberships = useCallback(async () => {
    if (!state.user) return;
    await hydrateMemberships(state.user, state.organizationId);
  }, [hydrateMemberships, state.user, state.organizationId]);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, switchOrganization, refetchMemberships }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
