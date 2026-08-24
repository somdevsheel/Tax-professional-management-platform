import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppError } from "../errors/app-error";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SKIP_TENANT_SCOPE_KEY } from "../decorators/skip-tenant-scope.decorator";
import type { AuthContext } from "../types/auth-context";

/**
 * Requires the verified token to carry a resolved organizationId before any tenant-scoped
 * handler runs. organizationId is read only from `request.authContext` (set by JwtAuthGuard
 * from the verified JWT) — never from a request body/param/header
 * (docs/database-design.md §1, docs/security-design.md §3).
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authContext: AuthContext | undefined = request.authContext;
    if (!authContext?.organizationId) {
      throw AppError.forbidden(
        "NO_ORGANIZATION_CONTEXT",
        "Select an organization before performing this action",
      );
    }
    return true;
  }
}
