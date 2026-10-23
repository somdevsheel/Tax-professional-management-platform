import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";

export interface NewNotification {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Same key → delivered at most once, however many times the sender runs. */
  dedupeKey?: string;
}

/**
 * In-app notifications. Every read/update is scoped to both organization and user: a member only
 * ever sees their own notifications for the firm they're currently signed into.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns how many were actually created (duplicates by dedupeKey are skipped). */
  async notify(notifications: NewNotification[]): Promise<number> {
    if (notifications.length === 0) return 0;
    const now = new Date();
    const { count } = await this.prisma.notification.createMany({
      data: notifications.map((n) => ({ ...n, channel: "in_app", sentAt: now })),
      skipDuplicates: true,
    });
    return count;
  }

  async list(organizationId: string, userId: string, opts: { unreadOnly?: boolean; limit?: number }) {
    return this.prisma.notification.findMany({
      where: { organizationId, userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.limit ?? 30, 100),
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        relatedEntityType: true,
        relatedEntityId: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  async unreadCount(organizationId: string, userId: string) {
    return this.prisma.notification.count({ where: { organizationId, userId, readAt: null } });
  }

  async markRead(organizationId: string, userId: string, notificationId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { id: notificationId, organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { id: notificationId, organizationId, userId },
        select: { id: true },
      });
      if (!exists) throw AppError.notFound("NOTIFICATION_NOT_FOUND", "Notification was not found");
    }
  }

  async markAllRead(organizationId: string, userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }
}
