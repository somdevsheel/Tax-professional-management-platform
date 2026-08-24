import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import type { CreatePortalAccountDto } from "./dto/create-portal-account.dto";

@Injectable()
export class PortalsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCatalog() {
    return this.prisma.portal.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  }

  async listAccountsForClient(organizationId: string, clientId: string) {
    await this.requireClient(organizationId, clientId);
    return this.prisma.portalAccount.findMany({
      where: { organizationId, clientId },
      include: { portal: true, credentials: { where: { deletedAt: null }, select: { id: true, status: true } } },
    });
  }

  async createAccount(organizationId: string, clientId: string, dto: CreatePortalAccountDto) {
    await this.requireClient(organizationId, clientId);
    const portal = await this.prisma.portal.findUnique({ where: { id: dto.portalId } });
    if (!portal || !portal.isActive) {
      throw AppError.notFound("PORTAL_NOT_FOUND", "Portal not found or inactive");
    }

    return this.prisma.portalAccount.create({
      data: {
        organizationId,
        clientId,
        portalId: dto.portalId,
        identifier: dto.identifier,
        displayUsername: dto.displayUsername,
      },
    });
  }

  async requireAccount(organizationId: string, portalAccountId: string) {
    const account = await this.prisma.portalAccount.findFirst({
      where: { id: portalAccountId, organizationId },
      include: { portal: true },
    });
    if (!account) {
      throw AppError.notFound("PORTAL_ACCOUNT_NOT_FOUND", "Portal account not found");
    }
    return account;
  }

  private async requireClient(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null },
    });
    if (!client) {
      throw AppError.notFound("CLIENT_NOT_FOUND", "Client was not found");
    }
  }
}
