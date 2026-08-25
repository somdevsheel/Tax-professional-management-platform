import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { CredentialsService } from "../credentials/credentials.service";
import type { RequestMeta } from "../auth/auth.service";
import type { CreatePortalSessionDto } from "./dto/create-portal-session.dto";
import type { PORTAL_SESSION_EVENT_TYPES } from "./dto/report-event.dto";

const ONE_TIME_TOKEN_TTL_MS = 60_000; // one minute — the desktop app must fetch immediately

/**
 * Backs the "[Open GST Portal]" workflow (docs/system-design.md §11). Issues a single-use,
 * short-TTL token the desktop app exchanges for a transient plaintext credential — the token
 * itself is never the credential, so a leaked session id alone cannot be replayed for
 * plaintext (docs/browser-automation-design.md §5, docs/security-design.md §6).
 */
@Injectable()
export class PortalSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly credentials: CredentialsService,
  ) {}

  async create(organizationId: string, dto: CreatePortalSessionDto, actorId: string, meta: RequestMeta) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, organizationId, deletedAt: null },
    });
    if (!client) {
      throw AppError.notFound("CLIENT_NOT_FOUND", "Client was not found");
    }

    const portalAccount = await this.prisma.portalAccount.findFirst({
      where: { id: dto.portalAccountId, organizationId, clientId: dto.clientId },
      include: { portal: true },
    });
    if (!portalAccount) {
      throw AppError.notFound("PORTAL_ACCOUNT_NOT_FOUND", "Portal account not found for this client");
    }

    const credential = await this.prisma.credential.findFirst({
      where: { portalAccountId: dto.portalAccountId, organizationId, status: "ACTIVE", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!credential) {
      throw AppError.notFound(
        "NO_ACTIVE_CREDENTIAL",
        "No active credential is stored for this portal account yet",
      );
    }

    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + ONE_TIME_TOKEN_TTL_MS);

    const session = await this.prisma.portalSession.create({
      data: {
        organizationId,
        clientId: dto.clientId,
        credentialId: credential.id,
        initiatedById: actorId,
        oneTimeTokenHash: this.hash(rawToken),
        expiresAt,
      },
    });
    await this.prisma.portalSessionEvent.create({ data: { portalSessionId: session.id, type: "opened" } });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "PORTAL_OPENED",
      resourceType: "portal_session",
      resourceId: session.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { clientId: dto.clientId, portalCode: portalAccount.portal.code },
    });
    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "PORTAL_SESSION_STARTED",
      resourceType: "portal_session",
      resourceId: session.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return { id: session.id, oneTimeToken: rawToken, expiresAt: session.expiresAt };
  }

  async get(organizationId: string, sessionId: string) {
    const session = await this.prisma.portalSession.findFirst({
      where: { id: sessionId, organizationId },
      // oneTimeTokenHash excluded deliberately — it's not independently exploitable (redemption
      // still requires the raw token, hashed and compared server-side) but there's no reason to
      // hand a secret-derived field to every caller with `credentials.use` (docs/security-review.md).
      select: {
        id: true,
        organizationId: true,
        clientId: true,
        credentialId: true,
        initiatedById: true,
        status: true,
        oneTimeTokenUsedAt: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!session) {
      throw AppError.notFound("PORTAL_SESSION_NOT_FOUND", "Portal session not found");
    }
    return session;
  }

  /**
   * Exchanges the one-time token for a transient plaintext credential. Single use: "is this
   * still unused" and "mark it used" are one conditional `updateMany` (the `claim` below), not
   * a separate check-then-write — two concurrent redemption attempts with the same token
   * (e.g. a legitimate fetch racing a captured-token replay) can otherwise both pass a plain
   * check and both receive plaintext before either write lands. Only one `updateMany` can flip
   * `oneTimeTokenUsedAt` from null, so the loser reliably gets `TOKEN_ALREADY_USED`
   * (docs/security-review.md).
   */
  async redeemCredential(sessionId: string, rawToken: string, meta: RequestMeta) {
    const session = await this.prisma.portalSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw AppError.notFound("PORTAL_SESSION_NOT_FOUND", "Portal session not found");
    }
    if (session.oneTimeTokenHash !== this.hash(rawToken)) {
      throw AppError.unauthorized("INVALID_SESSION_TOKEN", "Invalid portal session token");
    }
    if (session.expiresAt < new Date()) {
      await this.prisma.portalSession.update({ where: { id: sessionId }, data: { status: "EXPIRED" } });
      throw AppError.unauthorized("SESSION_TOKEN_EXPIRED", "This portal session has expired");
    }

    const claim = await this.prisma.portalSession.updateMany({
      where: { id: sessionId, oneTimeTokenUsedAt: null },
      data: { oneTimeTokenUsedAt: new Date(), status: "CREDENTIAL_ISSUED" },
    });
    if (claim.count === 0) {
      throw AppError.unauthorized("TOKEN_ALREADY_USED", "This session token has already been used");
    }

    const plaintext = await this.credentials.decryptForPortalSession(session.organizationId, session.credentialId);
    await this.credentials.markUsed(session.credentialId);

    await this.prisma.credentialAccessLog.create({
      data: {
        credentialId: session.credentialId,
        organizationId: session.organizationId,
        userId: session.initiatedById,
        action: "USED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        portalSessionId: sessionId,
      },
    });
    await this.audit.log({
      organizationId: session.organizationId,
      actorUserId: session.initiatedById,
      action: "CREDENTIAL_USED",
      resourceType: "credential",
      resourceId: session.credentialId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { portalSessionId: sessionId },
    });

    return plaintext;
  }

  async reportEvent(
    organizationId: string,
    sessionId: string,
    type: (typeof PORTAL_SESSION_EVENT_TYPES)[number],
    actorId: string,
    meta: RequestMeta,
  ) {
    const session = await this.prisma.portalSession.findFirst({ where: { id: sessionId, organizationId } });
    if (!session) {
      throw AppError.notFound("PORTAL_SESSION_NOT_FOUND", "Portal session not found");
    }

    await this.prisma.portalSessionEvent.create({ data: { portalSessionId: sessionId, type } });

    const statusByEvent: Record<string, string | undefined> = {
      awaiting_user_challenge: "AWAITING_USER_CHALLENGE",
      completed: "COMPLETED",
      failed: "FAILED",
    };
    const nextStatus = statusByEvent[type];
    if (nextStatus) {
      await this.prisma.portalSession.update({ where: { id: sessionId }, data: { status: nextStatus as never } });
    }

    if (type === "completed") {
      await this.audit.log({
        organizationId,
        actorUserId: actorId,
        action: "PORTAL_SESSION_COMPLETED",
        resourceType: "portal_session",
        resourceId: sessionId,
        result: "success",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    } else if (type === "failed") {
      await this.audit.log({
        organizationId,
        actorUserId: actorId,
        action: "PORTAL_SESSION_FAILED",
        resourceType: "portal_session",
        resourceId: sessionId,
        result: "failure",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
    }
  }

  private hash(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }
}
