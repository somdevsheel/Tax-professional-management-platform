import { Injectable, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { EMAIL_SERVICE, type EmailService } from "../infra/email/email-service.interface";
import { PasswordService } from "./password.service";
import { TokenService, IssuedTokens } from "./token.service";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** The one global system role granted to the creator of a new firm. Seeded by prisma/seed.ts. */
const FIRM_ADMIN_ROLE_NAME = "FIRM_ADMIN";

/**
 * Per-account login lockout window. `@Throttle` on the /auth/login route only limits by
 * source IP, which a distributed attacker grinding one known email across many IPs sails
 * straight through (docs/security-review.md). This is keyed by the account itself instead,
 * using LOGIN_FAILED rows already being written — no new table.
 */
const LOGIN_LOCKOUT_WINDOW_MINUTES = 15;
const LOGIN_LOCKOUT_MAX_FAILURES = 10;

// Short-TTL per docs/security-design.md §2 ("Password reset: single-use, short-TTL signed
// token"). 30 minutes balances "long enough that a real user's own email round-trip doesn't
// expire it" against "short enough that a leaked-but-unused link stops being useful quickly."
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw AppError.conflict("EMAIL_ALREADY_EXISTS", "An account with this email already exists");
    }

    const existingSlug = await this.prisma.organization.findUnique({
      where: { slug: dto.organizationSlug },
    });
    if (existingSlug) {
      throw AppError.conflict("ORGANIZATION_SLUG_TAKEN", "This organization URL is already taken");
    }

    const firmAdminRole = await this.prisma.role.findFirst({
      where: { organizationId: null, name: FIRM_ADMIN_ROLE_NAME, isSystem: true },
    });
    if (!firmAdminRole) {
      // Fails loudly rather than silently creating an org with no admin role — run `pnpm seed`.
      throw new Error(
        "System roles are not seeded. Run the database seed script before accepting registrations.",
      );
    }

    const passwordHash = await this.password.hash(dto.password);

    const { user, organization } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          status: "ACTIVE",
        },
      });
      const organization = await tx.organization.create({
        data: { name: dto.organizationName, slug: dto.organizationSlug, status: "TRIAL" },
      });
      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          roleId: firmAdminRole.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });
      return { user, organization };
    });

    await this.audit.log({
      organizationId: organization.id,
      actorUserId: user.id,
      action: "ORGANIZATION_CREATED",
      resourceType: "organization",
      resourceId: organization.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    const issued = await this.tokens.createSession(user.id, organization.id, meta.ip, meta.userAgent);
    await this.audit.log({
      organizationId: organization.id,
      actorUserId: user.id,
      action: "USER_LOGIN",
      resourceType: "user",
      resourceId: user.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.toAuthResult(user.id, user.email, user.fullName, organization.id, issued);
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (!user) {
      await this.password.verifyAgainstDummy();
      await this.audit.log({
        organizationId: null,
        actorUserId: null,
        action: "LOGIN_FAILED",
        resourceType: "user",
        result: "failure",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { emailDomain: dto.email.split("@")[1] },
      });
      throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
    }

    const recentFailures = await this.prisma.auditLog.count({
      where: {
        actorUserId: user.id,
        action: "LOGIN_FAILED",
        createdAt: { gte: new Date(Date.now() - LOGIN_LOCKOUT_WINDOW_MINUTES * 60_000) },
      },
    });
    if (recentFailures >= LOGIN_LOCKOUT_MAX_FAILURES) {
      // Still run the dummy verify so a locked-out account takes the same time as a normal
      // failed attempt — don't give a timing signal that distinguishes "locked out" from
      // "wrong password" on top of the identical response body/status below.
      await this.password.verifyAgainstDummy();
      await this.audit.log({
        organizationId: null,
        actorUserId: user.id,
        action: "LOGIN_FAILED",
        resourceType: "user",
        resourceId: user.id,
        result: "failure",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "account_locked" },
      });
      throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
    }

    const valid = await this.password.verify(user.passwordHash, dto.password);
    if (!valid || user.status !== "ACTIVE") {
      await this.audit.log({
        organizationId: null,
        actorUserId: user.id,
        action: "LOGIN_FAILED",
        resourceType: "user",
        resourceId: user.id,
        result: "failure",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      });
      throw AppError.unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
    }

    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { joinedAt: "desc" },
    });
    const organizationId = memberships.length === 1 ? memberships[0].organizationId : null;

    const issued = await this.tokens.createSession(user.id, organizationId, meta.ip, meta.userAgent);

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({
      organizationId,
      actorUserId: user.id,
      action: "USER_LOGIN",
      resourceType: "user",
      resourceId: user.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      ...this.toAuthResult(user.id, user.email, user.fullName, organizationId, issued),
      organizations: memberships.map((m) => m.organizationId),
    };
  }

  async refresh(rawRefreshToken: string): Promise<IssuedTokens> {
    return this.tokens.rotateRefreshToken(rawRefreshToken);
  }

  async logout(sessionId: string, userId: string, meta: RequestMeta) {
    await this.tokens.revokeSession(sessionId);
    await this.audit.log({
      organizationId: null,
      actorUserId: userId,
      action: "USER_LOGOUT",
      resourceType: "session",
      resourceId: sessionId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async logoutAll(userId: string, meta: RequestMeta) {
    await this.tokens.revokeAllSessionsForUser(userId);
    await this.audit.log({
      organizationId: null,
      actorUserId: userId,
      action: "USER_LOGOUT",
      resourceType: "user",
      resourceId: userId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { scope: "all_sessions" },
    });
  }

  async switchOrganization(userId: string, sessionId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw AppError.forbidden("NOT_A_MEMBER", "You are not an active member of this organization");
    }
    return this.tokens.reissueAccessTokenForOrganization(sessionId, organizationId);
  }

  /**
   * Always responds the same way whether or not the email matches a real account — a
   * distinguishable response here is a user-enumeration oracle. The audit log still records
   * which case happened (result: "failure" with no resourceId for an unknown email), same
   * asymmetry as login's own LOGIN_FAILED handling above.
   */
  async forgotPassword(dto: ForgotPasswordDto, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      await this.audit.log({
        organizationId: null,
        actorUserId: null,
        action: "PASSWORD_RESET_REQUESTED",
        resourceType: "user",
        result: "failure",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { emailDomain: dto.email.split("@")[1] },
      });
      return;
    }

    // Raw token exists only in memory here and in the one email sent below — never persisted;
    // only its hash is stored, so a database read alone can never produce a usable token
    // (same reasoning as RefreshToken — docs/security-design.md §2).
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000),
      },
    });

    const webAppOrigin = (this.config.get<string>("WEB_APP_ORIGIN") ?? "http://localhost:3000").split(",")[0];
    const resetUrl = `${webAppOrigin}/reset-password?token=${rawToken}`;
    await this.email.send({
      to: user.email,
      subject: "Reset your Tax Practice Platform password",
      text:
        `We received a request to reset your password. This link expires in ` +
        `${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes and can only be used once:\n\n${resetUrl}\n\n` +
        "If you didn't request this, you can safely ignore this email — your password won't change.",
    });

    await this.audit.log({
      organizationId: null,
      actorUserId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      resourceType: "user",
      resourceId: user.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async resetPassword(dto: ResetPasswordDto, meta: RequestMeta): Promise<void> {
    const tokenHash = createHash("sha256").update(dto.token).digest("hex");
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      await this.audit.log({
        organizationId: null,
        actorUserId: resetToken?.userId ?? null,
        action: "PASSWORD_RESET_COMPLETED",
        resourceType: "user",
        result: "failure",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: !resetToken ? "unknown_token" : resetToken.usedAt ? "already_used" : "expired" },
      });
      throw AppError.unauthorized("INVALID_RESET_TOKEN", "This password reset link is invalid or has expired");
    }

    const passwordHash = await this.password.hash(dto.newPassword);

    // Single-use: marking usedAt happens in the same transaction as the password change, so a
    // token can never be raced into resetting the password twice.
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);

    // Every session for this user must end — a successful reset means whoever just proved
    // control of the account's email should be the only one still signed in anywhere
    // (docs/security-design.md §2: "all sessions/refresh tokens for that user are revoked").
    await this.tokens.revokeAllSessionsForUser(resetToken.userId);

    await this.audit.log({
      organizationId: null,
      actorUserId: resetToken.userId,
      action: "PASSWORD_RESET_COMPLETED",
      resourceType: "user",
      resourceId: resetToken.userId,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, status: true, mfaEnabled: true },
    });
    if (!user) {
      throw AppError.notFound("USER_NOT_FOUND", "User not found");
    }
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, status: "ACTIVE" },
      include: { organization: true, role: true },
    });
    return {
      user,
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        role: m.role.name,
      })),
    };
  }

  private toAuthResult(
    userId: string,
    email: string,
    fullName: string,
    organizationId: string | null,
    issued: IssuedTokens,
  ) {
    return {
      user: { id: userId, email, fullName },
      organizationId,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresIn: issued.expiresIn,
    };
  }
}
