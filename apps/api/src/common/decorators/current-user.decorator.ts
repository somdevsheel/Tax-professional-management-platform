import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthContext } from "../types/auth-context";

/** Injects the verified auth context set by JwtAuthGuard. Never trust any other source for identity. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const request = ctx.switchToHttp().getRequest();
  return request.authContext;
});
