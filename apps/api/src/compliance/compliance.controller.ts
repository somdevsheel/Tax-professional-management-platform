import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { ComplianceService } from "./compliance.service";
import { CreateComplianceItemDto } from "./dto/create-compliance-item.dto";
import { UpdateComplianceItemDto } from "./dto/update-compliance-item.dto";
import { ListComplianceItemsQuery } from "./dto/list-compliance-items.query";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { SkipTenantScope } from "../common/decorators/skip-tenant-scope.decorator";
import type { AuthContext } from "../common/types/auth-context";

@Controller()
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  // The compliance-type catalog is global (not tenant data) — any authenticated user may
  // browse it, same as the portal catalog (portals.controller.ts).
  @SkipTenantScope()
  @Get("compliance-types")
  async catalog() {
    return { success: true, data: await this.compliance.listCatalog() };
  }

  @Get("compliance-items")
  @RequirePermission("compliance.view")
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListComplianceItemsQuery) {
    const result = await this.compliance.list(auth.organizationId!, query);
    return {
      success: true,
      data: result.data,
      meta: { nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total },
    };
  }

  @Get("compliance-items/:id")
  @RequirePermission("compliance.view")
  async get(@CurrentUser() auth: AuthContext, @Param("id") id: string) {
    return { success: true, data: await this.compliance.get(auth.organizationId!, id) };
  }

  @Patch("compliance-items/:id")
  @RequirePermission("compliance.manage")
  async update(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: UpdateComplianceItemDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const item = await this.compliance.update(auth.organizationId!, id, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: item };
  }

  @Delete("compliance-items/:id")
  @RequirePermission("compliance.manage")
  async remove(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.compliance.remove(auth.organizationId!, id, auth.userId, { ip, userAgent: userAgent ?? null });
    return { success: true, data: null };
  }

  @Get("clients/:id/compliance-items")
  @RequirePermission("compliance.view")
  async listForClient(@CurrentUser() auth: AuthContext, @Param("id") clientId: string) {
    return { success: true, data: await this.compliance.listForClient(auth.organizationId!, clientId) };
  }

  @Post("clients/:id/compliance-items")
  @RequirePermission("compliance.manage")
  async create(
    @CurrentUser() auth: AuthContext,
    @Param("id") clientId: string,
    @Body() dto: CreateComplianceItemDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const item = await this.compliance.create(auth.organizationId!, clientId, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: item };
  }
}
