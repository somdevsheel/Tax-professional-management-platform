import { Global, Module } from "@nestjs/common";
import { JwtKeysService } from "./jwt-keys.service";

@Global()
@Module({
  providers: [JwtKeysService],
  exports: [JwtKeysService],
})
export class JwtKeysModule {}
