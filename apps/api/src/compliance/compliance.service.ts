import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ComplianceStatus } from "@tax-platform/types";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import type { RequestMeta } from "../auth/auth.service";
import type { CreateComplianceItemDto } from "./dto/create-compliance-item.dto";
import type { UpdateComplianceItemDto } from "./dto/update-compliance-item.dto";
import type { GenerateCalendarDto, GenerateCalendarForAllDto } from "./dto/generate-calendar.dto";
import { ClientPiiService } from "../clients/client-pii.service";
import { startOfTodayIst } from "../common/dates";
import { assessmentYearFor, expandRule, parseFinancialYear, suggestedTypeCodes, type DueRule } from "./due-rules";

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
    private readonly clientPii: ClientPiiService,
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

  /**
   * What a client's compliance calendar for one financial year would contain: every catalog type
   * that has a due-date rule, whether it's suggested for this client (and why), and how many of
   * its filings are already tracked — the data behind the "generate calendar" picker.
   */
  async plan(organizationId: string, clientId: string, financialYear: string) {
    this.requireFinancialYear(financialYear);
    const client = await this.loadClientForSuggestions(organizationId, clientId);
    const suggestions = suggestedTypeCodes(client);
    const types = await this.calendarTypes(organizationId);
    const tracked = await this.prisma.complianceItem.groupBy({
      by: ["complianceTypeId"],
      where: { organizationId, clientId, financialYear },
      _count: true,
    });
    const trackedByType = new Map(tracked.map((t) => [t.complianceTypeId, t._count]));

    return types.map((type) => ({
      complianceType: type,
      suggested: suggestions.has(type.code),
      reason: suggestions.get(type.code) ?? null,
      periods: expandRule(type.defaultDueRule as DueRule, financialYear).length,
      tracked: trackedByType.get(type.id) ?? 0,
    }));
  }

  /** Creates a client's filings for a financial year from the catalog's due-date rules.
   *  Idempotent: filings already tracked for the same type/year/period are skipped. */
  async generate(organizationId: string, clientId: string, dto: GenerateCalendarDto, actorId: string, meta: RequestMeta) {
    this.requireFinancialYear(dto.financialYear);
    await this.requireClient(organizationId, clientId);
    const types = (await this.calendarTypes(organizationId)).filter((t) => dto.complianceTypeIds.includes(t.id));
    if (types.length !== new Set(dto.complianceTypeIds).size) {
      throw AppError.notFound("COMPLIANCE_TYPE_NOT_FOUND", "One or more compliance types don't exist or have no due-date rule");
    }

    const result = await this.createCalendarItems(organizationId, clientId, types, dto.financialYear, dto.includePastDue ?? false);
    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "COMPLIANCE_CALENDAR_GENERATED",
      resourceType: "client",
      resourceId: clientId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { financialYear: dto.financialYear, complianceTypeIds: dto.complianceTypeIds, ...result },
    });
    return result;
  }

  /** Generates every active client's calendar for a financial year using each client's suggested
   *  filings — the "set up the whole firm for the new year" action. */
  async generateForAllClients(organizationId: string, dto: GenerateCalendarForAllDto, actorId: string, meta: RequestMeta) {
    this.requireFinancialYear(dto.financialYear);
    const types = await this.calendarTypes(organizationId);
    const clients = await this.prisma.client.findMany({
      where: { organizationId, deletedAt: null, status: { in: ["ACTIVE", "ONBOARDING"] } },
    });

    const totals = { clients: 0, created: 0, alreadyTracked: 0, skippedPastDue: 0 };
    for (const row of clients) {
      const pii = await this.clientPii.decryptClient(row);
      const suggested = suggestedTypeCodes({ entityType: row.entityType, gstin: pii.gstin, tan: pii.tan });
      const result = await this.createCalendarItems(
        organizationId,
        row.id,
        types.filter((t) => suggested.has(t.code)),
        dto.financialYear,
        dto.includePastDue ?? false,
      );
      totals.clients++;
      totals.created += result.created;
      totals.alreadyTracked += result.alreadyTracked;
      totals.skippedPastDue += result.skippedPastDue;
    }

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "COMPLIANCE_CALENDAR_GENERATED",
      resourceType: "organization",
      resourceId: organizationId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { financialYear: dto.financialYear, allClients: true, ...totals },
    });
    return totals;
  }

  private async createCalendarItems(
    organizationId: string,
    clientId: string,
    types: Array<{ id: string; defaultDueRule: Prisma.JsonValue }>,
    financialYear: string,
    includePastDue: boolean,
  ) {
    const today = startOfTodayIst();
    const assessmentYear = assessmentYearFor(financialYear);
    let skippedPastDue = 0;
    const rows: Prisma.ComplianceItemCreateManyInput[] = [];
    for (const type of types) {
      for (const { period, dueDate } of expandRule(type.defaultDueRule as DueRule, financialYear)) {
        const pastDue = dueDate < today;
        if (pastDue && !includePastDue) {
          skippedPastDue++;
          continue;
        }
        rows.push({
          organizationId,
          clientId,
          complianceTypeId: type.id,
          financialYear,
          assessmentYear,
          period,
          dueDate,
          status: pastDue ? "OVERDUE" : "UPCOMING",
        });
      }
    }
    // skipDuplicates relies on the (org, client, type, financialYear, period) unique index.
    const { count } = rows.length > 0 ? await this.prisma.complianceItem.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
    return { created: count, alreadyTracked: rows.length - count, skippedPastDue };
  }

  /** Catalog types usable for calendar generation: global or this organization's own, with a
   *  due-date rule. */
  private calendarTypes(organizationId: string) {
    return this.prisma.complianceType.findMany({
      where: {
        OR: [{ organizationId: null }, { organizationId }],
        defaultDueRule: { not: Prisma.DbNull },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  }

  private async loadClientForSuggestions(organizationId: string, clientId: string) {
    const row = await this.prisma.client.findFirst({ where: { id: clientId, organizationId, deletedAt: null } });
    if (!row) {
      throw AppError.notFound("CLIENT_NOT_FOUND", "Client was not found");
    }
    const pii = await this.clientPii.decryptClient(row);
    return { entityType: row.entityType, gstin: pii.gstin, tan: pii.tan };
  }

  private requireFinancialYear(financialYear: string) {
    if (parseFinancialYear(financialYear) === null) {
      throw new AppError("INVALID_FINANCIAL_YEAR", "financialYear must be consecutive years like 2025-26");
    }
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
