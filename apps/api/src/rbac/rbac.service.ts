import { Injectable } from "@nestjs/common";
import type { Permission } from "@tax-platform/types";
import { PrismaService } from "../infra/prisma/prisma.service";

/**
 * Resolves a caller's effective permissions from role_permissions, scoped to their
 * membership in one organization. Always resolved server-side, per request — never trusted
 * from the client and never embedded in the access token, so a role change takes effect
 * immediately (docs/security-design.md §2, §4).
 */
@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissionsForMember(userId: string, organizationId: string): Promise<Set<string>> {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!membership || membership.status !== "ACTIVE") {
      return new Set();
    }

    return new Set(membership.role.permissions.map((rp) => rp.permission.code));
  }

  async hasPermission(userId: string, organizationId: string, permission: Permission): Promise<boolean> {
    const permissions = await this.getPermissionsForMember(userId, organizationId);
    return permissions.has(permission);
  }
}
