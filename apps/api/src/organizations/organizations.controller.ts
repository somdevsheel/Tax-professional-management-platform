import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { ChangeRoleDto } from "./dto/change-role.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import type { AuthContext } from "../common/types/auth-context";

@Controller("organizations/current")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  async getCurrent(@CurrentUser() auth: AuthContext) {
    return { success: true, data: await this.organizations.getCurrent(auth.organizationId!) };
  }

  @Get("members")
  @RequirePermission("employees.manage")
  async listMembers(@CurrentUser() auth: AuthContext) {
    return { success: true, data: await this.organizations.listMembers(auth.organizationId!) };
  }

  @Post("members/invite")
  @RequirePermission("employees.manage")
  async invite(
    @CurrentUser() auth: AuthContext,
    @Body() dto: InviteMemberDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const member = await this.organizations.inviteMember(
      auth.organizationId!,
      dto.email,
      dto.roleId,
      auth.userId,
      { ip, userAgent: userAgent ?? null },
    );
    return { success: true, data: member };
  }

  @Patch("members/:id")
  @RequirePermission("employees.manage")
  async changeRole(
    @CurrentUser() auth: AuthContext,
    @Param("id") memberId: string,
    @Body() dto: ChangeRoleDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const member = await this.organizations.changeRole(
      auth.organizationId!,
      memberId,
      dto.roleId,
      auth.userId,
      { ip, userAgent: userAgent ?? null },
    );
    return { success: true, data: member };
  }

  @Delete("members/:id")
  @RequirePermission("employees.manage")
  async removeMember(
    @CurrentUser() auth: AuthContext,
    @Param("id") memberId: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const member = await this.organizations.removeMember(auth.organizationId!, memberId, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: member };
  }
}
