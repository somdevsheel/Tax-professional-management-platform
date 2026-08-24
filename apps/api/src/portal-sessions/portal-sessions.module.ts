import { Module } from "@nestjs/common";
import { PortalSessionsController } from "./portal-sessions.controller";
import { PortalSessionsService } from "./portal-sessions.service";
import { AuditModule } from "../audit/audit.module";
import { CredentialsModule } from "../credentials/credentials.module";

@Module({
  imports: [AuditModule, CredentialsModule],
  controllers: [PortalSessionsController],
  providers: [PortalSessionsService],
})
export class PortalSessionsModule {}
