import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CredentialsService } from "./credentials.service";
import { CreateCredentialDto } from "./dto/create-credential.dto";
import { RotateCredentialDto } from "./dto/rotate-credential.dto";
import { RevealCredentialDto } from "./dto/reveal-credential.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import type { AuthContext } from "../common/types/auth-context";

@Controller()
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get("portal-accounts/:id/credentials")
  @RequirePermission("credentials.view")
  async list(@CurrentUser() auth: AuthContext, @Param("id") portalAccountId: string) {
    return { success: true, data: await this.credentials.listMetadata(auth.organizationId!, portalAccountId) };
  }

  @Post("portal-accounts/:id/credentials")
  @RequirePermission("credentials.create")
  async create(
    @CurrentUser() auth: AuthContext,
    @Param("id") portalAccountId: string,
    @Body() dto: CreateCredentialDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const credential = await this.credentials.create(auth.organizationId!, portalAccountId, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: credential };
  }

  @Get("credentials/:id")
  @RequirePermission("credentials.view")
  async get(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const credential = await this.credentials.getMetadata(auth.organizationId!, id, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: credential };
  }

  @Patch("credentials/:id")
  @RequirePermission("credentials.update")
  async rotate(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: RotateCredentialDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const credential = await this.credentials.rotate(auth.organizationId!, id, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: credential };
  }

  @Delete("credentials/:id")
  @RequirePermission("credentials.delete")
  async remove(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.credentials.remove(auth.organizationId!, id, auth.userId, { ip, userAgent: userAgent ?? null });
    return { success: true, data: null };
  }

  // Deliberately tightly throttled — this is the one endpoint that can return plaintext to the
  // web UI at all, and only when the caller re-proves their own password (docs/security-design.md §6).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("credentials/:id/reveal")
  @RequirePermission("credentials.reveal")
  async reveal(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: RevealCredentialDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const plaintext = await this.credentials.reveal(auth.organizationId!, id, auth.userId, dto.currentPassword, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: plaintext };
  }
}
