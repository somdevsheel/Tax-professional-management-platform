import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Query } from "@nestjs/common";
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";
import { CreateContactDto } from "./dto/create-contact.dto";
import { AssignClientDto } from "./dto/assign-client.dto";
import { ListClientsQuery } from "./dto/list-clients.query";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import type { AuthContext } from "../common/types/auth-context";

@Controller("clients")
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermission("clients.view")
  async list(@CurrentUser() auth: AuthContext, @Query() query: ListClientsQuery) {
    const result = await this.clients.list(auth.organizationId!, query);
    return {
      success: true,
      data: result.data,
      meta: { nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total },
    };
  }

  @Get(":id")
  @RequirePermission("clients.view")
  async get(@CurrentUser() auth: AuthContext, @Param("id") id: string) {
    return { success: true, data: await this.clients.get(auth.organizationId!, id) };
  }

  @Post()
  @RequirePermission("clients.create")
  async create(
    @CurrentUser() auth: AuthContext,
    @Body() dto: CreateClientDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const client = await this.clients.create(auth.organizationId!, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: client };
  }

  @Patch(":id")
  @RequirePermission("clients.update")
  async update(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: UpdateClientDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const client = await this.clients.update(auth.organizationId!, id, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: client };
  }

  @Delete(":id")
  @RequirePermission("clients.delete")
  async remove(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.clients.remove(auth.organizationId!, id, auth.userId, { ip, userAgent: userAgent ?? null });
    return { success: true, data: null };
  }

  @Get(":id/contacts")
  @RequirePermission("clients.view")
  async listContacts(@CurrentUser() auth: AuthContext, @Param("id") id: string) {
    return { success: true, data: await this.clients.listContacts(auth.organizationId!, id) };
  }

  @Post(":id/contacts")
  @RequirePermission("clients.update")
  async addContact(@CurrentUser() auth: AuthContext, @Param("id") id: string, @Body() dto: CreateContactDto) {
    return { success: true, data: await this.clients.addContact(auth.organizationId!, id, dto) };
  }

  @Post(":id/assignments")
  @RequirePermission("clients.update")
  async assign(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: AssignClientDto,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    const assignment = await this.clients.assign(auth.organizationId!, id, dto, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: assignment };
  }

  @Delete(":id/assignments/:assignmentId")
  @RequirePermission("clients.update")
  async unassign(
    @CurrentUser() auth: AuthContext,
    @Param("id") id: string,
    @Param("assignmentId") assignmentId: string,
    @Ip() ip: string,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.clients.unassign(auth.organizationId!, id, assignmentId, auth.userId, {
      ip,
      userAgent: userAgent ?? null,
    });
    return { success: true, data: null };
  }
}
