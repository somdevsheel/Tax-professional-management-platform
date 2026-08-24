import { Module } from "@nestjs/common";
import { CredentialsController } from "./credentials.controller";
import { CredentialsService } from "./credentials.service";
import { CredentialCryptoService } from "./credential-crypto.service";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [CredentialsController],
  providers: [CredentialsService, CredentialCryptoService],
  exports: [CredentialsService, CredentialCryptoService],
})
export class CredentialsModule {}
