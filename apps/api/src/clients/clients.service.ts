import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ClientStatus, EntityType } from "@tax-platform/types";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import type { RequestMeta } from "../auth/auth.service";
import type { CreateClientDto } from "./dto/create-client.dto";
import type { UpdateClientDto } from "./dto/update-client.dto";
import type { CreateContactDto } from "./dto/create-contact.dto";
import type { AssignClientDto } from "./dto/assign-client.dto";
import { CLIENT_PII_FIELDS, ClientPiiService, type ClientPii } from "./client-pii.service";

export interface ClientListFilters {
  status?: ClientStatus;
  entityType?: EntityType;
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
    private readonly pii: ClientPiiService,
  ) {}

  async list(organizationId: string, filters: ClientListFilters) {
    const limit = Math.min(filters.limit ?? 50, 200);

    const where: Prisma.ClientWhereInput = {
      organizationId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.assignedTo
        ? { assignments: { some: { organizationMemberId: filters.assignedTo, unassignedAt: null } } }
        : {}),
      // Identifiers are encrypted (docs/security-design.md §5a), so they match by blind index:
      // a full PAN/GSTIN/TAN/CIN finds its client, a fragment of one doesn't. Name stays a
      // case-insensitive substring match.
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" as const } },
              ...(await this.pii.searchIndexes(organizationId, filters.search)),
            ],
          }
        : {}),
    };

    // A cursor is resolved by Prisma independent of `where` — a cursor id from another
    // tenant wouldn't leak that client's data (the `where` still applies to the page itself),
    // but "the query behaves differently" is a weak cross-tenant existence oracle for an id an
    // attacker would already need to know. Verifying it belongs to this org first closes that
    // (docs/security-review.md); an unrecognized cursor is treated as "start from the top"
    // rather than an error, so it fails safe either way.
    const cursor = filters.cursor
      ? await this.prisma.client.findFirst({ where: { id: filters.cursor, organizationId }, select: { id: true } })
      : null;

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { name: "asc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      }),
      this.prisma.client.count({ where }),
    ]);

    const hasMore = clients.length > limit;
    const page = hasMore ? clients.slice(0, limit) : clients;
    return {
      data: await Promise.all(page.map((c) => this.pii.toClientView(c))),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
      total,
    };
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
    const { contacts, ...rest } = client;
    return {
      ...(await this.pii.toClientView(rest)),
      contacts: await Promise.all(contacts.map((c) => this.pii.toContactView(organizationId, c))),
    };
  }

  async create(organizationId: string, dto: CreateClientDto, actorId: string, meta: RequestMeta) {
    // The id is chosen here rather than by the database because the PII ciphertext is bound to
    // it (as GCM additional data) and must be computed before the row exists.
    const id = randomUUID();
    const { pii, rest } = splitPii(dto);
    const client = await this.prisma.client.create({
      data: {
        id,
        organizationId,
        createdById: actorId,
        ...rest,
        ...(await this.pii.encryptClient(organizationId, id, { ...EMPTY_PII, ...pii })),
      } as Prisma.ClientUncheckedCreateInput,
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

    return this.pii.toClientView(client);
  }

  async update(
    organizationId: string,
    clientId: string,
    dto: UpdateClientDto,
    actorId: string,
    meta: RequestMeta,
  ) {
    const existing = await this.requireClient(organizationId, clientId);
    const { pii, rest } = splitPii(dto);
    // PII is one ciphertext, so a partial update decrypts, merges the changed fields (undefined =
    // unchanged, null = cleared), and re-encrypts the whole payload under a fresh nonce.
    const piiColumns =
      Object.keys(pii).length > 0
        ? await this.pii.encryptClient(organizationId, clientId, { ...(await this.pii.decryptClient(existing)), ...pii })
        : {};
    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: { ...rest, ...piiColumns } as Prisma.ClientUpdateInput,
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

    return this.pii.toClientView(updated);
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
    const id = randomUUID();
    const contact = await this.prisma.clientContact.create({
      data: {
        id,
        clientId,
        isPrimary: dto.isPrimary ?? false,
        ...(await this.pii.encryptContact(organizationId, clientId, id, {
          name: dto.name,
          role: dto.role ?? null,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
        })),
      },
    });
    return this.pii.toContactView(organizationId, contact);
  }

  async listContacts(organizationId: string, clientId: string) {
    await this.requireClient(organizationId, clientId);
    const contacts = await this.prisma.clientContact.findMany({ where: { clientId } });
    return Promise.all(contacts.map((c) => this.pii.toContactView(organizationId, c)));
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

const EMPTY_PII: ClientPii = Object.fromEntries(CLIENT_PII_FIELDS.map((f) => [f, null])) as ClientPii;

/** Separates a create/update DTO into its encrypted PII fields and its plain columns. */
function splitPii<T extends Partial<CreateClientDto>>(dto: T) {
  const pii: Partial<ClientPii> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dto)) {
    if ((CLIENT_PII_FIELDS as readonly string[]).includes(key)) {
      if (value !== undefined) (pii as Record<string, unknown>)[key] = value;
    } else {
      rest[key] = value;
    }
  }
  return { pii, rest };
}
