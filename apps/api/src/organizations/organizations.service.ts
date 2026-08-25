import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors/app-error";
import type { RequestMeta } from "../auth/auth.service";

// SUPER_ADMIN is a platform-operator role (docs/database-design.md §RBAC — "null = platform
// system role"), not something a firm's own admin should ever be able to grant via
// employees.manage. It's seeded alongside every other system role with the same
// organizationId=null/isSystem=true shape, so it must be excluded explicitly rather than
// relying on that shape alone to distinguish "assignable to a firm member" roles.
const PLATFORM_ONLY_ROLES = new Set(["SUPER_ADMIN"]);

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCurrent(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      throw AppError.notFound("ORGANIZATION_NOT_FOUND", "Organization not found");
    }
    return org;
  }

  async listMembers(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, fullName: true } }, role: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async inviteMember(
    organizationId: string,
    email: string,
    roleId: string,
    invitedBy: string,
    meta: RequestMeta,
  ) {
    await this.requireAssignableRole(organizationId, roleId);

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw AppError.notFound(
        "USER_NOT_FOUND",
        "No account exists for this email yet — ask them to register first",
      );
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
    });
    if (existing) {
      throw AppError.conflict("ALREADY_A_MEMBER", "This user is already a member of the organization");
    }

    const member = await this.prisma.organizationMember.create({
      data: { organizationId, userId: user.id, roleId, status: "INVITED", invitedBy },
    });

    await this.audit.log({
      organizationId,
      actorUserId: invitedBy,
      action: "MEMBER_INVITED",
      resourceType: "organization_member",
      resourceId: member.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { invitedUserId: user.id },
    });

    return member;
  }

  async changeRole(
    organizationId: string,
    memberId: string,
    roleId: string,
    actorId: string,
    meta: RequestMeta,
  ) {
    const member = await this.requireMember(organizationId, memberId);
    await this.requireAssignableRole(organizationId, roleId);
    const updated = await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: { roleId, status: member.status === "INVITED" ? "ACTIVE" : member.status, joinedAt: member.joinedAt ?? new Date() },
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "MEMBER_ROLE_CHANGED",
      resourceType: "organization_member",
      resourceId: member.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { newRoleId: roleId },
    });

    return updated;
  }

  async removeMember(organizationId: string, memberId: string, actorId: string, meta: RequestMeta) {
    const member = await this.requireMember(organizationId, memberId);
    const updated = await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: { status: "DISABLED" },
    });

    await this.audit.log({
      organizationId,
      actorUserId: actorId,
      action: "MEMBER_REMOVED",
      resourceType: "organization_member",
      resourceId: member.id,
      result: "success",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return updated;
  }

  /**
   * The only place a `roleId` supplied by a caller (invite or role-change) is trusted — every
   * other path to a role must go through this. Scopes to the org's own custom roles plus
   * global system roles, explicitly excluding platform-only ones
   * (docs/security-review.md — privilege escalation via unscoped roleId).
   */
  private async requireAssignableRole(organizationId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, OR: [{ organizationId }, { organizationId: null, isSystem: true }] },
    });
    if (!role || PLATFORM_ONLY_ROLES.has(role.name)) {
      throw AppError.notFound("ROLE_NOT_FOUND", "Role not found for this organization");
    }
    return role;
  }

  private async requireMember(organizationId: string, memberId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!member) {
      throw AppError.notFound("MEMBER_NOT_FOUND", "Member not found in this organization");
    }
    return member;
  }
}
