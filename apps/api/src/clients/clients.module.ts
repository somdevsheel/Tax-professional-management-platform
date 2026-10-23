import { Module } from "@nestjs/common";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { AuditModule } from "../audit/audit.module";
import { ClientPiiService } from "./client-pii.service";
import { ClientPiiBackfillService } from "./client-pii-backfill.service";

@Module({
  imports: [AuditModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientPiiService, ClientPiiBackfillService],
  exports: [ClientsService, ClientPiiService],
})
export class ClientsModule {}
