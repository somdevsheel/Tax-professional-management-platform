import { Injectable, Logger } from "@nestjs/common";
import type { AuditAction } from "@tax-platform/types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";

export interface AuditEntry {
  organizationId: string | null;
  actorUserId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  result: "success" | "failure";
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Non-sensitive context only. NEVER pass passwords/OTPs/tokens/keys (docs/security-design.md §7). */
  metadata?: Record<string, unknown>;
}

const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "passwordHash",
  "otp",
  "captcha",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "privateKey",
]);

/**
 * Append-only audit trail writer. The `audit_logs` table's application DB role has no
 * UPDATE/DELETE grant in production (docs/database-design.md §"audit_logs"); this service is
 * the single write path so every credential/security event is captured consistently.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    const metadata = entry.metadata ? this.stripSensitiveKeys(entry.metadata) : {};

    await this.prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        result: entry.result,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private stripSensitiveKeys(metadata: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (FORBIDDEN_METADATA_KEYS.has(key)) {
        this.logger.warn(`Refused to write forbidden audit metadata key "${key}"`);
        continue;
      }
      clean[key] = value;
    }
    return clean;
  }
}
