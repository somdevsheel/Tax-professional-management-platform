import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthContext } from "../common/types/auth-context";
import { PrismaService } from "../infra/prisma/prisma.service";

// Kept in sync with organizations.service.ts's PLATFORM_ONLY_ROLES — a firm member should
// never even see a platform-operator role as a listed option, let alone be able to assign it.
const PLATFORM_ONLY_ROLE_NAMES = ["SUPER_ADMIN"];

@Controller()
export class RbacController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("roles")
  async listRoles(@CurrentUser() auth: AuthContext) {
    const roles = await this.prisma.role.findMany({
      where: {
        OR: [{ organizationId: auth.organizationId }, { organizationId: null, isSystem: true }],
        name: { notIn: PLATFORM_ONLY_ROLE_NAMES },
      },
      orderBy: { name: "asc" },
    });
    return { success: true, data: roles };
  }

  @Get("permissions")
  async listPermissions() {
    const permissions = await this.prisma.permission.findMany({ orderBy: { code: "asc" } });
    return { success: true, data: permissions };
  }
}
