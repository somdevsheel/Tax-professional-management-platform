import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PortalsService } from "./portals.service";
import { CreatePortalAccountDto } from "./dto/create-portal-account.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { SkipTenantScope } from "../common/decorators/skip-tenant-scope.decorator";
import type { AuthContext } from "../common/types/auth-context";

@Controller()
export class PortalsController {
  constructor(private readonly portals: PortalsService) {}

  // The portal catalog is global (not tenant data) — any authenticated user may browse it.
  @SkipTenantScope()
  @Get("portals")
  async catalog() {
    return { success: true, data: await this.portals.listCatalog() };
  }

  @Get("clients/:id/portal-accounts")
  @RequirePermission("clients.view")
  async listAccounts(@CurrentUser() auth: AuthContext, @Param("id") clientId: string) {
    return { success: true, data: await this.portals.listAccountsForClient(auth.organizationId!, clientId) };
  }

  @Post("clients/:id/portal-accounts")
  @RequirePermission("clients.update")
  async createAccount(
    @CurrentUser() auth: AuthContext,
    @Param("id") clientId: string,
    @Body() dto: CreatePortalAccountDto,
  ) {
    return { success: true, data: await this.portals.createAccount(auth.organizationId!, clientId, dto) };
  }
}
