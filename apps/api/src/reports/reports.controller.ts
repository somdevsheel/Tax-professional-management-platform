import { Controller, Get } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import type { AuthContext } from "../common/types/auth-context";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("summary")
  @RequirePermission("reports.view")
  async summary(@CurrentUser() auth: AuthContext) {
    return { success: true, data: await this.reports.summary(auth.organizationId!) };
  }
}
