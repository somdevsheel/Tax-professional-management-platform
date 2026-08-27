import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EMAIL_SERVICE } from "./email-service.interface";
import { NoopEmailService } from "./noop-email.provider";

/**
 * Selects the EmailService implementation by EMAIL_PROVIDER — same shape as
 * infra/kms/kms.module.ts and infra/antivirus/antivirus.module.ts. Only "noop" (development-only)
 * exists today. The documented production extension point is a generic SMTP provider (works
 * with SES/SendGrid/Postmark/a self-hosted mail server without a provider-specific
 * implementation per vendor) — not built yet because which provider to use hadn't been decided
 * at the time this was written; add an `SmtpEmailProvider` here (using `nodemailer` against
 * standard SMTP credentials) and register it the same way `LocalKmsProvider`/
 * `NoopAntivirusScanner` are registered in their modules once a provider is chosen.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    NoopEmailService,
    {
      provide: EMAIL_SERVICE,
      useFactory: (config: ConfigService, noop: NoopEmailService) => {
        const provider = config.get<string>("EMAIL_PROVIDER") ?? "noop";
        switch (provider) {
          case "noop":
            return noop;
          default:
            throw new Error(
              `Unknown EMAIL_PROVIDER "${provider}" — only "noop" (development) is implemented. ` +
                "See infra/email/email.module.ts for the production SMTP extension point.",
            );
        }
      },
      inject: [ConfigService, NoopEmailService],
    },
  ],
  exports: [EMAIL_SERVICE],
})
export class EmailModule {}
