"use client";

import { ApiClient } from "@tax-platform/api-client";

const API_ROOT = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const API_BASE_URL = `${API_ROOT}/api/v1`;

// One client instance per browser tab, holding the access token in memory only — never
// localStorage/sessionStorage, per docs/security-design.md §2. The refresh token lives solely
// in the httpOnly cookie the backend sets; this client never sees it (platform: "web").
export const apiClient = new ApiClient({
  baseUrl: API_BASE_URL,
  platform: "web",
});
