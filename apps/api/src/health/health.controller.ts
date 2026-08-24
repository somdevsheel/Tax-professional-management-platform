import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { PrismaService } from "../infra/prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  liveness() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", checks: { database: "ok" } };
    } catch {
      throw new ServiceUnavailableException({ status: "unavailable", checks: { database: "failed" } });
    }
  }
}
