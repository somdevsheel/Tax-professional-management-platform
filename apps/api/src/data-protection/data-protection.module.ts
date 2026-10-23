import { Global, Module } from "@nestjs/common";
import { OrganizationKeyService } from "./organization-key.service";
import { PiiCipherService } from "./pii-cipher.service";

/** Field-level encryption of personal data under per-organization keys (docs/security-design.md
 *  §5a). Global, like KmsModule, since any module holding personal data may need it. */
@Global()
@Module({
  providers: [OrganizationKeyService, PiiCipherService],
  exports: [PiiCipherService],
})
export class DataProtectionModule {}
