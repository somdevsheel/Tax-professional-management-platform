import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import jwt from "jsonwebtoken";
import { JwtKeysService } from "../../infra/jwt-keys/jwt-keys.service";
import { AppError } from "../errors/app-error";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { AuthContext, JwtAccessTokenPayload } from "../types/auth-context";

/**
 * Verifies the RS256 access token and attaches a minimal, verified AuthContext to the
 * request. This is the only place identity is established — every downstream guard/handler
 * trusts `request.authContext`, never a header/body-supplied user or org id
 * (docs/security-design.md §4).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtKeys: JwtKeysService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest();

    if (isPublic) {
      return true;
    }

    const header: string | undefined = request.headers?.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw AppError.unauthorized("UNAUTHORIZED", "Missing bearer token");
    }
    const token = header.slice("Bearer ".length);

    let payload: JwtAccessTokenPayload;
    try {
      payload = jwt.verify(token, this.jwtKeys.publicKey, {
        algorithms: ["RS256"],
        issuer: "tax-platform",
      }) as JwtAccessTokenPayload;
    } catch {
      throw AppError.unauthorized("UNAUTHORIZED", "Invalid or expired token");
    }

    const authContext: AuthContext = {
      userId: payload.sub,
      organizationId: payload.orgId ?? null,
      sessionId: payload.sessionId,
    };
    request.authContext = authContext;
    return true;
  }
}
