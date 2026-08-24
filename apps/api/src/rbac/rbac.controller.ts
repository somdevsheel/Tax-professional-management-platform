import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthContext } from "../common/types/auth-context";
import { PrismaService } from "../infra/prisma/prisma.service";

@Controller()
export class RbacController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("roles")
  async listRoles(@CurrentUser() auth: AuthContext) {
    const roles = await this.prisma.role.findMany({
      where: { OR: [{ organizationId: auth.organizationId }, { organizationId: null, isSystem: true }] },
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
