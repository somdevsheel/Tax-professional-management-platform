import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EmailMessage, EmailService } from "./email-service.interface";

/**
 * Development-only EmailService: same shape and same safety net as LocalKmsProvider
 * (infra/kms/local-kms.provider.ts) and NoopAntivirusScanner
 * (infra/antivirus/noop-antivirus.provider.ts) — refuses to start under NODE_ENV=production.
 * Never actually sends anything; logs the full message instead, which is also how a password
 * reset can be tested end-to-end in development without a real mail provider configured (the
 * reset link lands in this process's own logs).
 */
@Injectable()
export class NoopEmailService implements EmailService, OnModuleInit {
  private readonly logger = new Logger(NoopEmailService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (this.config.get<string>("NODE_ENV") === "production") {
      throw new Error(
        "NoopEmailService must never be used in production — configure EMAIL_PROVIDER with a " +
          "real mail provider before password reset / invite emails are exposed to real users " +
          "(docs/security-design.md).",
      );
    }
    this.logger.warn("Using NoopEmailService (dev-only — logs instead of sending) — never rely on this in production.");
  }

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`[NoopEmailService] Would send email to ${message.to}: "${message.subject}"\n${message.text}`);
  }
}
