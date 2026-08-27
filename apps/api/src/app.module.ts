import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { PrismaModule } from "./infra/prisma/prisma.module";
import { JwtKeysModule } from "./infra/jwt-keys/jwt-keys.module";
import { KmsModule } from "./infra/kms/kms.module";
import { ObjectStorageModule } from "./infra/object-storage/object-storage.module";
import { AntivirusModule } from "./infra/antivirus/antivirus.module";
import { EmailModule } from "./infra/email/email.module";
import { RbacModule } from "./rbac/rbac.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ClientsModule } from "./clients/clients.module";
import { PortalsModule } from "./portals/portals.module";
import { CredentialsModule } from "./credentials/credentials.module";
import { PortalSessionsModule } from "./portal-sessions/portal-sessions.module";
import { TasksModule } from "./tasks/tasks.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { DocumentsModule } from "./documents/documents.module";
import { ReportsModule } from "./reports/reports.module";
import { HealthModule } from "./health/health.module";

import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { TenantScopeGuard } from "./common/guards/tenant-scope.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";

// Fields that must never reach logs, in any shape/nesting, per docs/security-design.md §7.
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.currentPassword",
  "req.body.newPassword",
  "req.body.refreshToken",
  "req.body.otp",
  "req.body.captcha",
  "res.headers['set-cookie']",
  "*.password",
  "*.passwordHash",
  "*.accessToken",
  "*.refreshToken",
  "*.secret",
  "*.privateKey",
  "*.wrappedDataKey",
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
        level: process.env.NODE_ENV === "production" ? "info" : "debug",
        autoLogging: { ignore: (req) => req.url === "/health" || req.url === "/health/ready" },
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: Number(process.env.THROTTLE_TTL_SECONDS ?? 60) * 1000,
          limit: Number(process.env.THROTTLE_LIMIT ?? 100),
        },
      ],
    }),
    PrismaModule,
    JwtKeysModule,
    KmsModule,
    ObjectStorageModule,
    AntivirusModule,
    EmailModule,
    RbacModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    ClientsModule,
    PortalsModule,
    CredentialsModule,
    PortalSessionsModule,
    TasksModule,
    ComplianceModule,
    DocumentsModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantScopeGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
