import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ANTIVIRUS_SCANNER } from "./antivirus-scanner.interface";
import { NoopAntivirusScanner } from "./noop-antivirus.provider";

/**
 * Selects the AntivirusScanner implementation by ANTIVIRUS_PROVIDER — same shape as
 * infra/kms/kms.module.ts. Only "noop" (development-only) exists today; a real engine is the
 * documented production extension point (docs/security-design.md §9).
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    NoopAntivirusScanner,
    {
      provide: ANTIVIRUS_SCANNER,
      useFactory: (config: ConfigService, noop: NoopAntivirusScanner) => {
        const provider = config.get<string>("ANTIVIRUS_PROVIDER") ?? "noop";
        switch (provider) {
          case "noop":
            return noop;
          default:
            throw new Error(
              `Unknown ANTIVIRUS_PROVIDER "${provider}" — only "noop" (development) is implemented. ` +
                "See docs/security-design.md §9 for the production scanning-engine extension point.",
            );
        }
      },
      inject: [ConfigService, NoopAntivirusScanner],
    },
  ],
  exports: [ANTIVIRUS_SCANNER],
})
export class AntivirusModule {}
