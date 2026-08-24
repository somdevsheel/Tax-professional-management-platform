import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import type { AuthContext } from "../common/types/auth-context";
import { PrismaService } from "../infra/prisma/prisma.service";

@Controller("audit-logs")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission("audit_logs.view")
  async list(
    @CurrentUser() auth: AuthContext,
    @Query("resourceType") resourceType?: string,
    @Query("resourceId") resourceId?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const limit = Math.min(Number(limitRaw) || 50, 200);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        organizationId: auth.organizationId,
        ...(resourceType ? { resourceType } : {}),
        ...(resourceId ? { resourceId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      success: true,
      data: page,
      meta: { nextCursor: hasMore ? page[page.length - 1].id : null, hasMore },
    };
  }
}
