import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuditModule } from "../audit/audit.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { DeadlineSweepService } from "./deadline-sweep.service";

@Module({
  imports: [AuditModule, ConfigModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, DeadlineSweepService],
  exports: [NotificationsService, DeadlineSweepService],
})
export class NotificationsModule {}
