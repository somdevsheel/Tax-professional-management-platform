import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";

/**
 * Read-only aggregation over Clients/Tasks/Compliance/Documents — deliberately has no data
 * model of its own (docs/database-design.md has no `reports` table), unlike every other module
 * in this codebase. Every query below is still explicitly organizationId-scoped, same as
 * everywhere else (docs/security-design.md §3), even though nothing here is ever mutated.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(organizationId: string) {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      clientTotal,
      clientsByStatus,
      taskTotal,
      tasksByStatus,
      tasksByPriority,
      overdueTaskCount,
      complianceTotal,
      complianceByStatus,
      overdueComplianceCount,
      dueSoonComplianceCount,
      documentTotal,
      documentSizeAgg,
    ] = await Promise.all([
      this.prisma.client.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.client.groupBy({
        by: ["status"],
        where: { organizationId, deletedAt: null },
        _count: true,
      }),
      this.prisma.task.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.task.groupBy({ by: ["status"], where: { organizationId, deletedAt: null }, _count: true }),
      this.prisma.task.groupBy({ by: ["priority"], where: { organizationId, deletedAt: null }, _count: true }),
      this.prisma.task.count({
        where: {
          organizationId,
          deletedAt: null,
          dueDate: { lt: now },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
      this.prisma.complianceItem.count({ where: { organizationId } }),
      this.prisma.complianceItem.groupBy({ by: ["status"], where: { organizationId }, _count: true }),
      this.prisma.complianceItem.count({
        where: {
          organizationId,
          dueDate: { lt: now },
          status: { notIn: ["FILED", "VERIFIED", "NOT_APPLICABLE"] },
        },
      }),
      this.prisma.complianceItem.count({
        where: {
          organizationId,
          dueDate: { gte: now, lte: in30Days },
          status: { notIn: ["FILED", "VERIFIED", "NOT_APPLICABLE"] },
        },
      }),
      this.prisma.document.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.document.aggregate({ where: { organizationId, deletedAt: null }, _sum: { sizeBytes: true } }),
    ]);

    return {
      clients: {
        total: clientTotal,
        byStatus: this.toCountMap(clientsByStatus, "status"),
      },
      tasks: {
        total: taskTotal,
        byStatus: this.toCountMap(tasksByStatus, "status"),
        byPriority: this.toCountMap(tasksByPriority, "priority"),
        overdueCount: overdueTaskCount,
      },
      compliance: {
        total: complianceTotal,
        byStatus: this.toCountMap(complianceByStatus, "status"),
        overdueCount: overdueComplianceCount,
        dueNext30DaysCount: dueSoonComplianceCount,
      },
      documents: {
        total: documentTotal,
        totalSizeBytes: documentSizeAgg._sum.sizeBytes ?? 0,
      },
    };
  }

  private toCountMap<K extends string>(
    rows: Array<Record<K, string> & { _count: number }>,
    key: K,
  ): Record<string, number> {
    const map: Record<string, number> = {};
    for (const row of rows) {
      map[row[key]] = row._count;
    }
    return map;
  }
}
