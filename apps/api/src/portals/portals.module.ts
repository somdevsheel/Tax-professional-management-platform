import { Module } from "@nestjs/common";
import { PortalsController } from "./portals.controller";
import { PortalsService } from "./portals.service";

@Module({
  controllers: [PortalsController],
  providers: [PortalsService],
  exports: [PortalsService],
})
export class PortalsModule {}
