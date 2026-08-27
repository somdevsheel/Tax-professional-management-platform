import { Body, Controller, Get, Headers, Ip, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { SwitchOrganizationDto } from "./dto/switch-organization.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { Public } from "../common/decorators/public.decorator";
import { SkipTenantScope } from "../common/decorators/skip-tenant-scope.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthContext } from "../common/types/auth-context";

const REFRESH_COOKIE = "refresh_token";
const isWebClient = (platform?: string) => platform !== "desktop";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Headers("x-client-platform") platform: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto, { ip, userAgent: userAgent ?? null });
    return this.respondWithTokens(result, platform, res);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Headers("x-client-platform") platform: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, { ip, userAgent: userAgent ?? null });
    return this.respondWithTokens(result, platform, res);
  }

  @Public()
  @Post("refresh")
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Headers("x-client-platform") platform: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      throw new UnauthorizedException("Missing refresh token");
    }
    const issued = await this.auth.refresh(rawToken);
    return this.respondWithTokens(
      {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        expiresIn: issued.expiresIn,
      },
      platform,
      res,
    );
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("forgot-password")
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.auth.forgotPassword(dto, { ip, userAgent: userAgent ?? null });
    // Always the same response regardless of whether the email matched an account — see
    // AuthService.forgotPassword's comment on why a distinguishable response is an
    // enumeration oracle.
    return { success: true, data: { message: "If that email has an account, a reset link has been sent." } };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("reset-password")
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.auth.resetPassword(dto, { ip, userAgent: userAgent ?? null });
    return { success: true, data: null };
  }

  // Logging out must never require an active organization context — a user who belongs to
  // zero or multiple firms (organizationId is null until they pick one) still needs to be
  // able to end their own session (docs/security-review.md — logout was unreachable for them).
  @SkipTenantScope()
  @Post("logout")
  async logout(
    @CurrentUser() authContext: AuthContext,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(authContext.sessionId, authContext.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    res.clearCookie(REFRESH_COOKIE);
    return { success: true, data: null };
  }

  @SkipTenantScope()
  @Post("logout-all")
  async logoutAll(
    @CurrentUser() authContext: AuthContext,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(authContext.userId, { ip, userAgent: userAgent ?? null });
    res.clearCookie(REFRESH_COOKIE);
    return { success: true, data: null };
  }

  @SkipTenantScope()
  @Post("switch-organization")
  async switchOrganization(@CurrentUser() authContext: AuthContext, @Body() dto: SwitchOrganizationDto) {
    const result = await this.auth.switchOrganization(
      authContext.userId,
      authContext.sessionId,
      dto.organizationId,
    );
    return { success: true, data: result };
  }

  @SkipTenantScope()
  @Get("me")
  async me(@CurrentUser() authContext: AuthContext) {
    return { success: true, data: await this.auth.me(authContext.userId) };
  }

  private respondWithTokens(
    result: { accessToken: string; refreshToken: string; expiresIn: number } & Record<string, unknown>,
    platform: string | undefined,
    res: Response,
  ) {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const { refreshToken, ...rest } = result;
    return {
      success: true,
      data: isWebClient(platform) ? rest : { ...rest, refreshToken },
    };
  }
}
