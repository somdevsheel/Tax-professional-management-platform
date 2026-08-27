import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AntivirusScanner } from "./antivirus-scanner.interface";

// The EICAR test string — a standardised, deliberately harmless signature every real antivirus
// product is designed to flag under exactly this name, for testing purposes. It is not malware.
// Checking for it (and nothing else) is how this dev-only stand-in can still let the "an
// infected upload gets rejected" pathway be exercised and tested honestly, without pretending a
// pattern match for one canary string is a real malware scanner.
const EICAR_TEST_STRING =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/**
 * Development-only AntivirusScanner: same shape and same safety net as LocalKmsProvider
 * (infra/kms/local-kms.provider.ts) — refuses to start under NODE_ENV=production. Production
 * deployments must supply a real AntivirusScanner backed by an actual scanning engine (a ClamAV
 * daemon, a cloud AV API) before document upload is safe to expose to real users.
 */
@Injectable()
export class NoopAntivirusScanner implements AntivirusScanner, OnModuleInit {
  private readonly logger = new Logger(NoopAntivirusScanner.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (this.config.get<string>("NODE_ENV") === "production") {
      throw new Error(
        "NoopAntivirusScanner must never be used in production — configure ANTIVIRUS_PROVIDER " +
          "with a real scanning engine before document upload is exposed to real users " +
          "(docs/security-design.md §9).",
      );
    }
    this.logger.warn(
      "Using NoopAntivirusScanner (dev-only — only catches the harmless EICAR test string, " +
        "not real malware) — never rely on this in production.",
    );
  }

  async scan(buffer: Buffer): Promise<{ clean: boolean; reason?: string }> {
    if (buffer.includes(EICAR_TEST_STRING)) {
      return { clean: false, reason: "EICAR test signature detected" };
    }
    return { clean: true };
  }
}
