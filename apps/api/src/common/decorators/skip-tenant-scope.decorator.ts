import { SetMetadata } from "@nestjs/common";

export const SKIP_TENANT_SCOPE_KEY = "skipTenantScope";

/**
 * Marks a route as valid without an active organization context — e.g. GET /auth/me,
 * POST /auth/switch-organization. Every other authenticated route requires the caller's JWT
 * to carry a resolved organizationId (docs/security-design.md §3).
 */
export const SkipTenantScope = () => SetMetadata(SKIP_TENANT_SCOPE_KEY, true);
