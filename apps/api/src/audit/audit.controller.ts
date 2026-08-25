import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import type { AuthContext } from "../common/types/auth-context";
import { PrismaService } from "../infra/prisma/prisma.service";
import { ListAuditLogsQuery } from "./dto/list-audit-logs.query";

@Controller("audit-logs")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission("audit_logs.view")
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListAuditLogsQuery) {
    const limit = Math.min(query.limit ?? 50, 200);

    // Verify the cursor belongs to this org before using it — same cross-tenant-oracle
    // reasoning as clients.service.ts (docs/security-review.md).
    const cursor = query.cursor
      ? await this.prisma.auditLog.findFirst({
          where: { id: query.cursor, organizationId: auth.organizationId },
          select: { id: true },
        })
      : null;

    const logs = await this.prisma.auditLog.findMany({
      where: {
        organizationId: auth.organizationId,
        ...(query.resourceType ? { resourceType: query.resourceType } : {}),
        ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
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
