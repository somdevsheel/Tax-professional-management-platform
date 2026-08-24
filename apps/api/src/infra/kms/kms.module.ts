import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { KMS_PROVIDER } from "./kms-provider.interface";
import { LocalKmsProvider } from "./local-kms.provider";

/**
 * Selects the KeyManagementProvider implementation by KMS_PROVIDER. Only "local" (dev-only)
 * exists today; "kms"/"vault" are the documented production extension points
 * (docs/security-design.md §5) — wire a real provider here when a deployment target is chosen.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    LocalKmsProvider,
    {
      provide: KMS_PROVIDER,
      useFactory: (config: ConfigService, local: LocalKmsProvider) => {
        const provider = config.get<string>("KMS_PROVIDER") ?? "local";
        switch (provider) {
          case "local":
            return local;
          default:
            throw new Error(
              `Unknown KMS_PROVIDER "${provider}" — only "local" (development) is implemented. ` +
                "See docs/security-design.md §5 for the production KMS/Vault extension point.",
            );
        }
      },
      inject: [ConfigService, LocalKmsProvider],
    },
  ],
  exports: [KMS_PROVIDER],
})
export class KmsModule {}
