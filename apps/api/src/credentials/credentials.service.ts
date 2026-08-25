import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { PasswordService } from "../auth/password.service";
import { CredentialCryptoService, type CredentialPlaintext } from "./credential-crypto.service";
import type { RequestMeta } from "../auth/auth.service";
import type { CreateCredentialDto } from "./dto/create-credential.dto";
import type { RotateCredentialDto } from "./dto/rotate-credential.dto";

// Metadata-only projection — payloadCiphertext/encryptionNonce/wrappedDataKey never leave
// this service except through the narrow, audited decrypt paths below
// (docs/security-design.md §6).
const METADATA_SELECT = {
  id: true,
  portalAccountId: true,
  status: true,
  lastUsedAt: true,
  lastRotatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CredentialCryptoService,
    private readonly password: PasswordService,
  ) {}

  async create(
    organizationId: string,
    portalAccountId: string,
    dto: CreateCredentialDto,
    actorId: string,
    meta: RequestMeta,
  ) {
    await this.requirePortalAccount(organizationId, portalAccountId);
    const encrypted = await this.crypto.encrypt({ username: dto.username, password: dto.password });

    const credential = await this.prisma.credential.create({
      data: {
        organizationId,
        portalAccountId,
        payloadCiphertext: encrypted.payloadCiphertext,
        encryptionNonce: encrypted.encryptionNonce,
        wrappedDataKey: encrypted.wrappedDataKey,
        keyVersion: encrypted.keyVersion,
        algorithm: encrypted.algorithm,
        createdById: actorId,
      },
      select: METADATA_SELECT,
    });

    await this.recordAccess(credential.id, organizationId, actorId, "CREATED", meta);
    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CREDENTIAL_CREATED",
      resourceType: "credential",
      resourceId: credential.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { portalAccountId },
    });

    return credential;
  }

  async listMetadata(organizationId: string, portalAccountId: string) {
    return this.prisma.credential.findMany({
      where: { organizationId, portalAccountId, deletedAt: null },
      select: METADATA_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  async getMetadata(organizationId: string, credentialId: string, actorId: string, meta: RequestMeta) {
    const credential = await this.prisma.credential.findFirst({
      where: { id: credentialId, organizationId, deletedAt: null },
      select: METADATA_SELECT,
    });
    if (!credential) {
      throw AppError.notFound("CREDENTIAL_NOT_FOUND", "Credential was not found");
    }

    await this.recordAccess(credentialId, organizationId, actorId, "VIEWED_METADATA", meta);
    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CREDENTIAL_ACCESSED",
      resourceType: "credential",
      resourceId: credentialId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return credential;
  }

  async rotate(
    organizationId: string,
    credentialId: string,
    dto: RotateCredentialDto,
    actorId: string,
    meta: RequestMeta,
  ) {
    const record = await this.requireFullRecord(organizationId, credentialId);
    const current = await this.crypto.decrypt(record);
    const next: CredentialPlaintext = {
      username: dto.username ?? current.username,
      password: dto.password ?? current.password,
    };
    const encrypted = await this.crypto.encrypt(next);

    const updated = await this.prisma.credential.update({
      where: { id: credentialId },
      data: {
        payloadCiphertext: encrypted.payloadCiphertext,
        encryptionNonce: encrypted.encryptionNonce,
        wrappedDataKey: encrypted.wrappedDataKey,
        keyVersion: encrypted.keyVersion,
        algorithm: encrypted.algorithm,
        status: "ACTIVE",
        lastRotatedAt: new Date(),
      },
      select: METADATA_SELECT,
    });

    await this.recordAccess(credentialId, organizationId, actorId, "ROTATED", meta);
    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CREDENTIAL_ROTATED",
      resourceType: "credential",
      resourceId: credentialId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return updated;
  }

  async remove(organizationId: string, credentialId: string, actorId: string, meta: RequestMeta) {
    await this.requireFullRecord(organizationId, credentialId);
    await this.prisma.credential.update({
      where: { id: credentialId },
      data: { deletedAt: new Date(), status: "REVOKED" },
    });

    await this.recordAccess(credentialId, organizationId, actorId, "DELETED", meta);
    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CREDENTIAL_DELETED",
      resourceType: "credential",
      resourceId: credentialId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  /**
   * Reveals plaintext to a human via the API. Requires org policy to allow it, plus a fresh
   * re-authentication (the caller's own current login password) — never just the
   * `credentials.reveal` permission alone (docs/security-design.md §6).
   */
  async reveal(
    organizationId: string,
    credentialId: string,
    actorId: string,
    currentPassword: string,
    meta: RequestMeta,
  ): Promise<CredentialPlaintext> {
    await this.assertRevealAllowed(organizationId);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actorId } });
    const verified = await this.password.verify(user.passwordHash, currentPassword);
    if (!verified) {
      await this.audit.log({
        organizationId,
        actorUserId: actorId,
        action: "CREDENTIAL_REVEALED",
        resourceType: "credential",
        resourceId: credentialId,
        result: "failure",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "step_up_reauth_failed" },
      });
      throw AppError.unauthorized("REAUTHENTICATION_FAILED", "Current password is incorrect");
    }

    const record = await this.requireFullRecord(organizationId, credentialId);
    const plaintext = await this.crypto.decrypt(record);

    await this.recordAccess(credentialId, organizationId, actorId, "REVEALED", meta);
    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "CREDENTIAL_REVEALED",
      resourceType: "credential",
      resourceId: credentialId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return plaintext;
  }

  /** Internal use only — called by PortalSessionsService, never exposed as a direct HTTP verb. */
  async decryptForPortalSession(
    organizationId: string,
    credentialId: string,
  ): Promise<CredentialPlaintext> {
    const record = await this.requireFullRecord(organizationId, credentialId);
    return this.crypto.decrypt(record);
  }

  async markUsed(credentialId: string): Promise<void> {
    await this.prisma.credential.update({ where: { id: credentialId }, data: { lastUsedAt: new Date() } });
  }

  private async assertRevealAllowed(organizationId: string): Promise<void> {
    const setting = await this.prisma.setting.findUnique({
      where: { organizationId_key: { organizationId, key: "credentials.revealEnabled" } },
    });
    // No row at all = default-enabled (an org that has never touched this setting can still
    // reveal). But once a row exists, only the literal boolean `true` re-enables it — any other
    // stored shape (false, "false", null, {}, ...) fails closed. The previous `=== false` check
    // only caught the exact literal `false` and silently left reveal enabled for every other
    // malformed value, which is the wrong default for a kill switch (docs/security-review.md).
    if (setting && setting.value !== true) {
      throw AppError.forbidden(
        "CREDENTIAL_REVEAL_DISABLED",
        "Revealing credential plaintext is disabled for this organization",
      );
    }
  }

  private async requireFullRecord(organizationId: string, credentialId: string) {
    const record = await this.prisma.credential.findFirst({
      where: { id: credentialId, organizationId, deletedAt: null },
    });
    if (!record) {
      throw AppError.notFound("CREDENTIAL_NOT_FOUND", "Credential was not found");
    }
    return record;
  }

  private async requirePortalAccount(organizationId: string, portalAccountId: string) {
    const account = await this.prisma.portalAccount.findFirst({
      where: { id: portalAccountId, organizationId },
    });
    if (!account) {
      throw AppError.notFound("PORTAL_ACCOUNT_NOT_FOUND", "Portal account not found");
    }
  }

  private async recordAccess(
    credentialId: string,
    organizationId: string,
    userId: string,
    action: string,
    meta: RequestMeta,
    portalSessionId?: string,
  ) {
    await this.prisma.credentialAccessLog.create({
      data: {
        credentialId,
        organizationId,
        userId,
        action,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        portalSessionId,
      },
    });
  }
}
