import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TaskPriority, TaskStatus } from "@tax-platform/types";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import type { RequestMeta } from "../auth/auth.service";
import type { CreateTaskDto } from "./dto/create-task.dto";
import type { UpdateTaskDto } from "./dto/update-task.dto";
import type { AssignTaskDto } from "./dto/assign-task.dto";
import type { CreateTaskCommentDto } from "./dto/create-task-comment.dto";

export interface TaskListFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  clientId?: string;
  dueBefore?: string;
  dueAfter?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

/**
 * Every method below requires organizationId explicitly and includes it in the query — same
 * tenant-isolation shape as ClientsService (docs/security-design.md §3). `assignedTo` is an
 * `OrganizationMember.id`, not a bare `User.id` — consistent with `ClientAssignment` — so
 * assigning a task always resolves to "a member of this org", never a user from elsewhere.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(organizationId: string, filters: TaskListFilters) {
    const limit = Math.min(filters.limit ?? 50, 200);

    const where: Prisma.TaskWhereInput = {
      organizationId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.assignedTo ? { assignedTo: filters.assignedTo } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.dueBefore || filters.dueAfter
        ? {
            dueDate: {
              ...(filters.dueBefore ? { lte: new Date(filters.dueBefore) } : {}),
              ...(filters.dueAfter ? { gte: new Date(filters.dueAfter) } : {}),
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { title: { contains: filters.search, mode: "insensitive" as const } },
              { description: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    // Same cross-tenant-cursor-oracle guard as ClientsService.list (docs/security-review.md).
    const cursor = filters.cursor
      ? await this.prisma.task.findFirst({ where: { id: filters.cursor, organizationId }, select: { id: true } })
      : null;

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
        include: { client: { select: { id: true, name: true } } },
      }),
      this.prisma.task.count({ where }),
    ]);

    const hasMore = tasks.length > limit;
    const page = hasMore ? tasks.slice(0, limit) : tasks;
    return { data: page, nextCursor: hasMore ? page[page.length - 1].id : null, hasMore, total };
  }

  async get(organizationId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      include: {
        client: { select: { id: true, name: true } },
        comments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!task) {
      throw AppError.notFound("TASK_NOT_FOUND", "Task was not found");
    }
    return task;
  }

  async create(organizationId: string, dto: CreateTaskDto, actorId: string, meta: RequestMeta) {
    if (dto.clientId) {
      await this.requireClientInOrg(organizationId, dto.clientId);
    }
    if (dto.assignedTo) {
      await this.requireMemberInOrg(organizationId, dto.assignedTo);
    }

    const task = await this.prisma.task.create({
      data: {
        organizationId,
        createdById: actorId,
        title: dto.title,
        description: dto.description,
        clientId: dto.clientId,
        portalAccountId: dto.portalAccountId,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assignedTo: dto.assignedTo,
        parentTaskId: dto.parentTaskId,
        recurrenceRule: dto.recurrenceRule as Prisma.InputJsonValue | undefined,
      } as Prisma.TaskUncheckedCreateInput,
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "TASK_CREATED",
      resourceType: "task",
      resourceId: task.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return task;
  }

  async update(organizationId: string, taskId: string, dto: UpdateTaskDto, actorId: string, meta: RequestMeta) {
    await this.requireTask(organizationId, taskId);
    if (dto.clientId) {
      await this.requireClientInOrg(organizationId, dto.clientId);
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      } as Prisma.TaskUncheckedUpdateInput,
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: dto.status === "COMPLETED" ? "TASK_COMPLETED" : "TASK_UPDATED",
      resourceType: "task",
      resourceId: taskId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return updated;
  }

  async assign(organizationId: string, taskId: string, dto: AssignTaskDto, actorId: string, meta: RequestMeta) {
    await this.requireTask(organizationId, taskId);
    if (dto.assignedTo) {
      await this.requireMemberInOrg(organizationId, dto.assignedTo);
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { assignedTo: dto.assignedTo ?? null },
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "TASK_ASSIGNED",
      resourceType: "task",
      resourceId: taskId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { assignedTo: dto.assignedTo ?? null },
    });

    return updated;
  }

  async complete(organizationId: string, taskId: string, actorId: string, meta: RequestMeta) {
    await this.requireTask(organizationId, taskId);
    const updated = await this.prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED" } });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "TASK_COMPLETED",
      resourceType: "task",
      resourceId: taskId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return updated;
  }

  async remove(organizationId: string, taskId: string, actorId: string, meta: RequestMeta) {
    await this.requireTask(organizationId, taskId);
    await this.prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "TASK_DELETED",
      resourceType: "task",
      resourceId: taskId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async listComments(organizationId: string, taskId: string) {
    await this.requireTask(organizationId, taskId);
    return this.prisma.taskComment.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } });
  }

  async addComment(organizationId: string, taskId: string, dto: CreateTaskCommentDto, actorId: string) {
    await this.requireTask(organizationId, taskId);
    return this.prisma.taskComment.create({ data: { taskId, authorId: actorId, body: dto.body } });
  }

  private async requireTask(organizationId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, organizationId, deletedAt: null } });
    if (!task) {
      throw AppError.notFound("TASK_NOT_FOUND", "Task was not found");
    }
    return task;
  }

  private async requireClientInOrg(organizationId: string, clientId: string) {
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
