import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ObjectStorageService } from "./object-storage.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule {}
