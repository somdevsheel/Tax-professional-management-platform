import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import type { RequestMeta } from "../auth/auth.service";
import type { CreateClientDto } from "./dto/create-client.dto";
import type { UpdateClientDto } from "./dto/update-client.dto";
import type { CreateContactDto } from "./dto/create-contact.dto";
import type { AssignClientDto } from "./dto/assign-client.dto";

export interface ClientListFilters {
  status?: string;
  entityType?: string;
  assignedTo?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Every method below requires organizationId explicitly and includes it in the query —
 * there is no code path in this service that can return another tenant's clients
 * (docs/security-design.md §3).
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, filters: ClientListFilters) {
    const limit = Math.min(filters.limit ?? 50, 200);

    const where = {
      organizationId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.entityType ? { entityType: filters.entityType as never } : {}),
      ...(filters.assignedTo
        ? { assignments: { some: { organizationMemberId: filters.assignedTo, unassignedAt: null } } }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" as const } },
              { pan: { contains: filters.search, mode: "insensitive" as const } },
              { gstin: { contains: filters.search, mode: "insensitive" as const } },
              { tan: { contains: filters.search, mode: "insensitive" as const } },
              { cin: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const clients = await this.prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    const hasMore = clients.length > limit;
    const page = hasMore ? clients.slice(0, limit) : clients;
    return { data: page, nextCursor: hasMore ? page[page.length - 1].id : null, hasMore };
  }

  async get(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null },
      include: {
        contacts: true,
        assignments: { where: { unassignedAt: null }, include: { member: { include: { user: true } } } },
        portalAccounts: { include: { portal: true } },
      },
    });
    if (!client) {
      throw AppError.notFound("CLIENT_NOT_FOUND", "Client was not found");
    }
    return client;
  }

  async create(organizationId: string, dto: CreateClientDto, actorId: string, meta: RequestMeta) {
    const client = await this.prisma.client.create({
      data: { organizationId, createdById: actorId, ...dto } as Prisma.ClientUncheckedCreateInput,
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CLIENT_CREATED",
      resourceType: "client",
      resourceId: client.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return client;
  }

  async update(
    organizationId: string,
    clientId: string,
    dto: UpdateClientDto,
    actorId: string,
    meta: RequestMeta,
  ) {
    await this.requireClient(organizationId, clientId);
    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: dto as Prisma.ClientUpdateInput,
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CLIENT_UPDATED",
      resourceType: "client",
      resourceId: clientId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return updated;
  }

  async remove(organizationId: string, clientId: string, actorId: string, meta: RequestMeta) {
    await this.requireClient(organizationId, clientId);
    await this.prisma.client.update({ where: { id: clientId }, data: { deletedAt: new Date() } });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CLIENT_DELETED",
      resourceType: "client",
      resourceId: clientId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async addContact(organizationId: string, clientId: string, dto: CreateContactDto) {
    await this.requireClient(organizationId, clientId);
    return this.prisma.clientContact.create({ data: { clientId, ...dto } });
  }

  async listContacts(organizationId: string, clientId: string) {
    await this.requireClient(organizationId, clientId);
    return this.prisma.clientContact.findMany({ where: { clientId } });
  }

  async assign(organizationId: string, clientId: string, dto: AssignClientDto, actorId: string, meta: RequestMeta) {
    await this.requireClient(organizationId, clientId);

    const member = await this.prisma.organizationMember.findFirst({
      where: { id: dto.organizationMemberId, organizationId },
    });
    if (!member) {
      throw AppError.notFound("MEMBER_NOT_FOUND", "Member not found in this organization");
    }

    const assignment = await this.prisma.clientAssignment.create({
      data: {
        clientId,
        organizationMemberId: dto.organizationMemberId,
        assignedRole: dto.assignedRole,
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CLIENT_ASSIGNED",
      resourceType: "client",
      resourceId: clientId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { organizationMemberId: dto.organizationMemberId },
    });

    return assignment;
  }

  async unassign(organizationId: string, clientId: string, assignmentId: string, actorId: string, meta: RequestMeta) {
    await this.requireClient(organizationId, clientId);
    const assignment = await this.prisma.clientAssignment.findFirst({
      where: { id: assignmentId, clientId },
    });
    if (!assignment) {
      throw AppError.notFound("ASSIGNMENT_NOT_FOUND", "Assignment not found");
    }
    const updated = await this.prisma.clientAssignment.update({
      where: { id: assignmentId },
      data: { unassignedAt: new Date() },
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CLIENT_ASSIGNED",
      resourceType: "client",
      resourceId: clientId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { unassigned: true, assignmentId },
    });

    return updated;
  }

  private async requireClient(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null },
    });
    if (!client) {
      throw AppError.notFound("CLIENT_NOT_FOUND", "Client was not found");
    }
    return client;
  }
}
