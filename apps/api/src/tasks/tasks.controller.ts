import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { AssignTaskDto } from "./dto/assign-task.dto";
import { CreateTaskCommentDto } from "./dto/create-task-comment.dto";
import { ListTasksQuery } from "./dto/list-tasks.query";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import type { AuthContext } from "../common/types/auth-context";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequirePermission("tasks.view")
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListTasksQuery) {
    const result = await this.tasks.list(auth.organizationId!, query);
    return {
      success: true,
      data: result.data,
      meta: { nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total },
    };
  }

  @Get(":id")
  @RequirePermission("tasks.view")
  async get(@CurrentUser() auth: AuthContext, @Param("id") id: string) {
    return { success: true, data: await this.tasks.get(auth.organizationId!, id) };
  }

  @Post()
  @RequirePermission("tasks.create")
  async create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateTaskDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const task = await this.tasks.create(auth.organizationId!, dto, auth.userId, { ip, userAgent: userAgent ?? null });
    return { success: true, data: task };
  }

  @Patch(":id")
  @RequirePermission("tasks.create")
  async update(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: UpdateTaskDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const task = await this.tasks.update(auth.organizationId!, id, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: task };
  }

  @Patch(":id/assign")
  @RequirePermission("tasks.assign")
  async assign(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: AssignTaskDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const task = await this.tasks.assign(auth.organizationId!, id, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: task };
  }

  @Post(":id/complete")
  @RequirePermission("tasks.complete")
  async complete(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const task = await this.tasks.complete(auth.organizationId!, id, auth.userId, { ip, userAgent: userAgent ?? null });
    return { success: true, data: task };
  }

  @Delete(":id")
  @RequirePermission("tasks.create")
  async remove(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.tasks.remove(auth.organizationId!, id, auth.userId, { ip, userAgent: userAgent ?? null });
    return { success: true, data: null };
  }

  @Get(":id/comments")
  @RequirePermission("tasks.view")
  async listComments(@CurrentUser() auth: AuthContext, @Param("id") id: string) {
    return { success: true, data: await this.tasks.listComments(auth.organizationId!, id) };
  }

  @Post(":id/comments")
  @RequirePermission("tasks.view")
  async addComment(@CurrentUser() auth: AuthContext, @Param("id") id: string, @Body() dto: CreateTaskCommentDto) {
    return { success: true, data: await this.tasks.addComment(auth.organizationId!, id, dto, auth.userId) };
  }
}
