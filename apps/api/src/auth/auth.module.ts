import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  // PasswordService is also exported for modules that need step-up re-authentication
  // (docs/security-design.md §6, e.g. credential reveal) without duplicating hashing logic.
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
