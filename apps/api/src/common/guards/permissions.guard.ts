import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@tax-platform/types";
import { AppError } from "../errors/app-error";
import { REQUIRED_PERMISSION_KEY } from "../decorators/require-permission.decorator";
import { RbacService } from "../../rbac/rbac.service";
import type { AuthContext } from "../types/auth-context";

/**
 * Enforces @RequirePermission() on a handler. Runs after JwtAuthGuard/TenantScopeGuard so
 * `request.authContext` is already verified and org-scoped (docs/security-design.md §4).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authContext: AuthContext | undefined = request.authContext;
    if (!authContext?.organizationId) {
      throw AppError.forbidden("FORBIDDEN", "No organization context");
    }

    const allowed = await this.rbac.hasPermission(
      authContext.userId,
      authContext.organizationId,
      required,
    );
    if (!allowed) {
      throw AppError.forbidden("FORBIDDEN", `Missing required permission: ${required}`);
    }
    return true;
  }
}
