import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import { PasswordService } from "./password.service";
import { TokenService, IssuedTokens } from "./token.service";
import type { RegisterDto } from "./dto/register.dto";
import type { LoginDto } from "./dto/login.dto";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** The one global system role granted to the creator of a new firm. Seeded by prisma/seed.ts. */
const FIRM_ADMIN_ROLE_NAME = "FIRM_ADMIN";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
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
