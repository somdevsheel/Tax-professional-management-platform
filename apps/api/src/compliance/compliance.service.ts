import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ComplianceStatus } from "@tax-platform/types";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import type { RequestMeta } from "../auth/auth.service";
import type { CreateComplianceItemDto } from "./dto/create-compliance-item.dto";
import type { UpdateComplianceItemDto } from "./dto/update-compliance-item.dto";

export interface ComplianceItemListFilters {
  status?: ComplianceStatus;
  clientId?: string;
  complianceTypeId?: string;
  dueBefore?: string;
  dueAfter?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Two-tier catalog/instance split, same shape as PortalsService: `ComplianceType` is a global,
 * seeded catalog (docs/database-design.md) browsable by any authenticated user;
 * `ComplianceItem` is the per-client tracked instance and, like every other tenant resource
 * here, every method requires organizationId explicitly (docs/security-design.md §3).
 */
@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listCatalog() {
    return this.prisma.complianceType.findMany({ orderBy: { name: "asc" } });
  }

  async list(organizationId: string, filters: ComplianceItemListFilters) {
    const limit = Math.min(filters.limit ?? 50, 200);

    const where: Prisma.ComplianceItemWhereInput = {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.complianceTypeId ? { complianceTypeId: filters.complianceTypeId } : {}),
      ...(filters.dueBefore || filters.dueAfter
        ? {
            dueDate: {
              ...(filters.dueBefore ? { lte: new Date(filters.dueBefore) } : {}),
              ...(filters.dueAfter ? { gte: new Date(filters.dueAfter) } : {}),
            },
          }
        : {}),
    };

    const cursor = filters.cursor
      ? await this.prisma.complianceItem.findFirst({ where: { id: filters.cursor, organizationId }, select: { id: true } })
      : null;

    const [items, total] = await Promise.all([
      this.prisma.complianceItem.findMany({
        where,
        orderBy: [{ dueDate: "asc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
        include: {
          client: { select: { id: true, name: true } },
          complianceType: true,
        },
      }),
      this.prisma.complianceItem.count({ where }),
    ]);

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { data: page, nextCursor: hasMore ? page[page.length - 1].id : null, hasMore, total };
  }

  async listForClient(organizationId: string, clientId: string) {
    await this.requireClient(organizationId, clientId);
    return this.prisma.complianceItem.findMany({
      where: { organizationId, clientId },
      orderBy: [{ dueDate: "asc" }],
      include: { complianceType: true },
    });
  }

  async get(organizationId: string, itemId: string) {
    const item = await this.prisma.complianceItem.findFirst({
      where: { id: itemId, organizationId },
      include: { client: { select: { id: true, name: true } }, complianceType: true },
    });
    if (!item) {
      throw AppError.notFound("COMPLIANCE_ITEM_NOT_FOUND", "Compliance item was not found");
    }
    return item;
  }

  async create(
    organizationId: string,
    clientId: string,
    dto: CreateComplianceItemDto,
    actorId: string,
    meta: RequestMeta,
  ) {
    await this.requireClient(organizationId, clientId);

    const type = await this.prisma.complianceType.findUnique({ where: { id: dto.complianceTypeId } });
    if (!type) {
      throw AppError.notFound("COMPLIANCE_TYPE_NOT_FOUND", "Compliance type not found");
    }
    if (dto.assignedTo) {
      await this.requireMemberInOrg(organizationId, dto.assignedTo);
    }

    const item = await this.prisma.complianceItem.create({
      data: {
        organizationId,
        clientId,
        complianceTypeId: dto.complianceTypeId,
        financialYear: dto.financialYear,
        assessmentYear: dto.assessmentYear,
        dueDate: new Date(dto.dueDate),
        assignedTo: dto.assignedTo,
        notes: dto.notes,
      } as Prisma.ComplianceItemUncheckedCreateInput,
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "COMPLIANCE_ITEM_CREATED",
      resourceType: "compliance_item",
      resourceId: item.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { clientId, complianceTypeId: dto.complianceTypeId },
    });

    return item;
  }

  async update(organizationId: string, itemId: string, dto: UpdateComplianceItemDto, actorId: string, meta: RequestMeta) {
    const existing = await this.requireItem(organizationId, itemId);
    if (dto.assignedTo) {
      await this.requireMemberInOrg(organizationId, dto.assignedTo);
    }

    const updated = await this.prisma.complianceItem.update({
      where: { id: itemId },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        filingDate: dto.filingDate ? new Date(dto.filingDate) : undefined,
      } as Prisma.ComplianceItemUncheckedUpdateInput,
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: dto.status && dto.status !== existing.status ? "COMPLIANCE_STATUS_CHANGED" : "COMPLIANCE_ITEM_UPDATED",
      resourceType: "compliance_item",
      resourceId: itemId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: dto.status ? { fromStatus: existing.status, toStatus: dto.status } : undefined,
    });

    return updated;
  }

  async remove(organizationId: string, itemId: string, actorId: string, meta: RequestMeta) {
    await this.requireItem(organizationId, itemId);
    await this.prisma.complianceItem.delete({ where: { id: itemId } });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "COMPLIANCE_ITEM_DELETED",
      resourceType: "compliance_item",
      resourceId: itemId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  private async requireItem(organizationId: string, itemId: string) {
    const item = await this.prisma.complianceItem.findFirst({ where: { id: itemId, organizationId } });
    if (!item) {
      throw AppError.notFound("COMPLIANCE_ITEM_NOT_FOUND", "Compliance item was not found");
    }
    return item;
  }

  private async requireClient(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!client) {
      throw AppError.notFound("CLIENT_NOT_FOUND", "Client was not found");
    }
  }

  private async requireMemberInOrg(organizationId: string, organizationMemberId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: organizationMemberId, organizationId },
      select: { id: true },
    });
    if (!member) {
      throw AppError.notFound("MEMBER_NOT_FOUND", "Member not found in this organization");
    }
  }
}
