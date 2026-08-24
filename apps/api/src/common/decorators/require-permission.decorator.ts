import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@tax-platform/types";

export const REQUIRED_PERMISSION_KEY = "requiredPermission";

/** Requires the caller's resolved role permissions to include this code (docs/security-design.md §4). */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
