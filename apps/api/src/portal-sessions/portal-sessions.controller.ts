import { Body, Controller, Get, Header, Headers, Ip, Param, Post } from "@nestjs/common";
import { PortalSessionsService } from "./portal-sessions.service";
import { CreatePortalSessionDto } from "./dto/create-portal-session.dto";
import { ReportEventDto } from "./dto/report-event.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { Public } from "../common/decorators/public.decorator";
import { AppError } from "../common/errors/app-error";
import type { AuthContext } from "../common/types/auth-context";

@Controller("portal-sessions")
export class PortalSessionsController {
  constructor(private readonly sessions: PortalSessionsService) {}

  @Post()
  @RequirePermission("credentials.use")
  async create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreatePortalSessionDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const session = await this.sessions.create(auth.organizationId!, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: session };
  }

  @Get(":id")
  @RequirePermission("credentials.use")
  async get(@CurrentUser() auth: AuthContext, @Param("id") id: string) {
    return { success: true, data: await this.sessions.get(auth.organizationId!, id) };
  }

  // Authenticated by the one-time session token itself (not the caller's JWT) — the desktop
  // app already proved authorization when it created the session; this is a narrow, single-use
  // handoff of the transient plaintext (docs/security-design.md §6).
  // Cache-Control: no-store — a plaintext-bearing 200 GET response is otherwise heuristically
  // cacheable by an intermediary, whose cache key is the URL while the actual secret lives in
  // the X-Portal-Session-Token header (docs/security-review.md).
  @Public()
  @Header("Cache-Control", "no-store, private")
  @Get(":id/credential")
  async getCredential(
    @Param("id") id: string,
    @Headers("x-portal-session-token") token: string | undefined,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    if (!token) {
      throw AppError.unauthorized("MISSING_SESSION_TOKEN", "Missing X-Portal-Session-Token header");
    }
    const plaintext = await this.sessions.redeemCredential(id, token, { ip, userAgent: userAgent ?? null });
    return { success: true, data: plaintext };
  }

  @Post(":id/events")
  @RequirePermission("credentials.use")
  async reportEvent(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: ReportEventDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.sessions.reportEvent(auth.organizationId!, id, dto.type, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: null };
  }
}
