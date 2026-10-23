import { Module } from "@nestjs/common";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";
import { AuditModule } from "../audit/audit.module";
import { ClientsModule } from "../clients/clients.module";

@Module({
  imports: [AuditModule, ClientsModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
