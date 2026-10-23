import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { addDays, daysBetween, startOfTodayIst } from "../common/dates";
import { NotificationsService, type NewNotification } from "./notifications.service";

/** Reminder points before a due date, in days. Each fires once per item per recipient. */
const REMINDER_DAYS = [7, 3, 1, 0] as const;
/** Overdue alerts go out only for items that went overdue recently, so generating a past year
 *  (or the first sweep after deploying this) doesn't flood everyone with stale alerts. */
const OVERDUE_ALERT_WINDOW_DAYS = 7;
const OPEN_COMPLIANCE_STATUSES = ["UPCOMING", "IN_PROGRESS", "OVERDUE"] as const;
const OPEN_TASK_STATUSES = ["TODO", "IN_PROGRESS", "WAITING"] as const;

export interface SweepResult {
  markedOverdue: number;
  notificationsCreated: number;
}

/**
 * Periodic deadline sweep: marks past-due compliance filings OVERDUE and sends in-app reminders
 * for compliance filings and tasks approaching or past their due date.
 *
 * Safe to run any number of times and on any number of API instances at once: status changes are
 * conditional (`status: UPCOMING` in the update's where), and every reminder carries a dedupe key
 * ("this reminder, this item, this person") backed by a unique index, so repeats are no-ops.
 * That's also why this is a plain interval rather than a distributed cron — there's nothing to
 * coordinate.
 */
@Injectable()
export class DeadlineSweepService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeadlineSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const minutes = Number(this.config.get<string>("DEADLINE_SWEEP_INTERVAL_MINUTES") ?? 60);
    // Tests drive sweep() directly with a fixed clock instead.
    if (this.config.get<string>("NODE_ENV") === "test" || !(minutes > 0)) return;
    const tick = () => void this.runSafely();
    setTimeout(tick, 15_000).unref();
    this.timer = setInterval(tick, minutes * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.sweep();
      if (result.markedOverdue + result.notificationsCreated > 0) {
        this.logger.log(`Deadline sweep: ${result.markedOverdue} filing(s) marked overdue, ${result.notificationsCreated} notification(s) sent.`);
      }
    } catch (err) {
      this.logger.error({ err }, "Deadline sweep failed");
    } finally {
      this.running = false;
    }
  }

  /** `organizationId` limits the sweep to one firm (tests, and re-running it for one firm by
   *  hand); the scheduled run covers every firm. */
  async sweep(now: Date = new Date(), scope: { organizationId?: string } = {}): Promise<SweepResult> {
    const today = startOfTodayIst(now);
    const org = scope.organizationId ? { organizationId: scope.organizationId } : {};
    const markedOverdue = await this.markOverdue(today, org);
    const notificationsCreated =
      (await this.notifications.notify(await this.complianceReminders(today, org))) +
      (await this.notifications.notify(await this.taskReminders(today, org)));
    return { markedOverdue, notificationsCreated };
  }

  /** UPCOMING filings whose due date has passed become OVERDUE. IN_PROGRESS ones are left alone —
   *  that status carries information ("someone's on it") that OVERDUE would erase, and the
   *  overdue-ness is still visible from the date and in reminders/reports. */
  private async markOverdue(today: Date, org: { organizationId?: string }): Promise<number> {
    const due = await this.prisma.complianceItem.findMany({
      where: { ...org, status: "UPCOMING", dueDate: { lt: today } },
      select: { id: true, organizationId: true },
    });
    const byOrg = new Map<string, string[]>();
    for (const item of due) byOrg.set(item.organizationId, [...(byOrg.get(item.organizationId) ?? []), item.id]);

    let total = 0;
    for (const [organizationId, ids] of byOrg) {
      const { count } = await this.prisma.complianceItem.updateMany({
        where: { id: { in: ids }, status: "UPCOMING" },
        data: { status: "OVERDUE" },
      });
      if (count === 0) continue;
      total += count;
      await this.audit.log({
        organizationId,
        actorUserId: null,
        action: "COMPLIANCE_MARKED_OVERDUE",
        resourceType: "compliance_item",
        result: "success",
        ipAddress: null,
        userAgent: null,
        metadata: { count, complianceItemIds: ids.slice(0, 100) },
      });
    }
    return total;
  }

  private async complianceReminders(today: Date, org: { organizationId?: string }): Promise<NewNotification[]> {
    const items = await this.prisma.complianceItem.findMany({
      where: {
        ...org,
        status: { in: [...OPEN_COMPLIANCE_STATUSES] },
        dueDate: { gte: addDays(today, -OVERDUE_ALERT_WINDOW_DAYS), lte: addDays(today, REMINDER_DAYS[0]) },
        client: { deletedAt: null },
      },
      include: { client: { select: { name: true } }, complianceType: { select: { name: true } } },
    });

    const out: NewNotification[] = [];
    const managersByOrg = new Map<string, Array<{ userId: string }>>();
    for (const item of items) {
      const days = daysBetween(today, item.dueDate);
      const stage = reminderStage(days);
      const recipients = item.assignedTo
        ? await this.activeMemberUser(item.organizationId, item.assignedTo)
        : await this.complianceManagers(item.organizationId, managersByOrg);

      const when = days < 0 ? "is overdue" : days === 0 ? "is due today" : days === 1 ? "is due tomorrow" : `is due in ${days} days`;
      for (const { userId } of recipients) {
        out.push({
          organizationId: item.organizationId,
          userId,
          type: days < 0 ? "COMPLIANCE_OVERDUE" : "COMPLIANCE_DUE_SOON",
          title: `${item.complianceType.name} ${when}`,
          body: `${item.client.name} · ${periodLabel(item.period, item.financialYear)} · due ${formatDate(item.dueDate)}`,
          relatedEntityType: "compliance_item",
          relatedEntityId: item.id,
          dedupeKey: `compliance:${item.id}:${stage}:${userId}`,
        });
      }
    }
    return out;
  }

  private async taskReminders(today: Date, org: { organizationId?: string }): Promise<NewNotification[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        ...org,
        deletedAt: null,
        assignedTo: { not: null },
        status: { in: [...OPEN_TASK_STATUSES] },
        dueDate: { gte: addDays(today, -OVERDUE_ALERT_WINDOW_DAYS), lte: addDays(today, 1) },
      },
      include: { client: { select: { name: true } } },
    });

    const out: NewNotification[] = [];
    for (const task of tasks) {
      const days = daysBetween(today, task.dueDate!);
      const when = days < 0 ? "is overdue" : days === 0 ? "is due today" : "is due tomorrow";
      for (const { userId } of await this.activeMemberUser(task.organizationId, task.assignedTo!)) {
        out.push({
          organizationId: task.organizationId,
          userId,
          type: days < 0 ? "TASK_OVERDUE" : "TASK_DUE_SOON",
          title: `Task ${when}: ${task.title}`,
          body: `${task.client ? `${task.client.name} · ` : ""}due ${formatDate(task.dueDate!)}`,
          relatedEntityType: "task",
          relatedEntityId: task.id,
          dedupeKey: `task:${task.id}:${reminderStage(days)}:${userId}`,
        });
      }
    }
    return out;
  }

  private async activeMemberUser(organizationId: string, organizationMemberId: string) {
    return this.prisma.organizationMember.findMany({
      where: { id: organizationMemberId, organizationId, status: "ACTIVE" },
      select: { userId: true },
    });
  }

  /** Who hears about an unassigned filing: every active member allowed to manage compliance. */
  private async complianceManagers(organizationId: string, cache: Map<string, Array<{ userId: string }>>) {
    let managers = cache.get(organizationId);
    if (!managers) {
      managers = await this.prisma.organizationMember.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          role: { permissions: { some: { permission: { code: "compliance.manage" } } } },
        },
        select: { userId: true },
      });
      cache.set(organizationId, managers);
    }
    return managers;
  }
}

/** Which reminder an item is due for: the nearest reminder point at or after `days` away, or
 *  "overdue". An item created 2 days before its due date gets the 3-day reminder, not 7/3/1 at
 *  once; later sweeps then send the 1-day and due-today ones. */
function reminderStage(days: number): string {
  if (days < 0) return "overdue";
  const point = [...REMINDER_DAYS].reverse().find((d) => days <= d) ?? REMINDER_DAYS[0];
  return `due${point}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function periodLabel(period: string | null, financialYear: string): string {
  const monthly = period && /^(\d{4})-(\d{2})$/.exec(period);
  if (monthly) return `${MONTHS[Number(monthly[2]) - 1]} ${monthly[1]}`;
  if (period && period !== "ANNUAL") return `${period} FY ${financialYear}`;
  return `FY ${financialYear}`;
}

function formatDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
