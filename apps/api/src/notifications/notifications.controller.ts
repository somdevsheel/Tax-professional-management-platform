import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ListNotificationsQuery } from "./dto/list-notifications.query";
import { NotificationsService } from "./notifications.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthContext } from "../common/types/auth-context";

/** No @RequirePermission: every member can read and dismiss their own notifications. */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListNotificationsQuery) {
    return { success: true, data: await this.notifications.list(auth.organizationId!, auth.userId, query) };
  }

  @Get("unread-count")
  async unreadCount(@CurrentUser() auth: AuthContext) {
    return { success: true, data: { count: await this.notifications.unreadCount(auth.organizationId!, auth.userId) } };
  }

  @Post("read-all")
  @HttpCode(200)
  async markAllRead(@CurrentUser() auth: AuthContext) {
    return { success: true, data: { updated: await this.notifications.markAllRead(auth.organizationId!, auth.userId) } };
  }

  @Post(":id/read")
  @HttpCode(200)
  async markRead(@CurrentUser() auth: AuthContext, @Param("id") id: string) {
    await this.notifications.markRead(auth.organizationId!, auth.userId, id);
    return { success: true, data: null };
  }
}
