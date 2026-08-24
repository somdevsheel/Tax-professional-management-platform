import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { KeyManagementProvider } from "./kms-provider.interface";

const KEY_VERSION = 1;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Development-only KeyManagementProvider: derives a single KEK from an environment secret via
 * HKDF. This is explicitly NOT acceptable in production — refuses to start under
 * NODE_ENV=production (docs/security-design.md §5). Production deployments must supply a real
 * `KeyManagementProvider` backed by a managed KMS or Vault.
 */
@Injectable()
export class LocalKmsProvider implements KeyManagementProvider, OnModuleInit {
  private readonly logger = new Logger(LocalKmsProvider.name);
  private kek!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (this.config.get<string>("NODE_ENV") === "production") {
      throw new Error(
        "LocalKmsProvider must never be used in production — configure KMS_PROVIDER=kms or " +
          "KMS_PROVIDER=vault with a real key management backend (docs/security-design.md §5).",
      );
    }

    const secret = this.config.get<string>("KEK_LOCAL_DEV_SECRET");
    if (!secret) {
      throw new Error("KEK_LOCAL_DEV_SECRET must be set for the local KMS provider.");
    }
    this.logger.warn(
      "Using LocalKmsProvider (dev-only key derivation) — never rely on this in production.",
    );
    this.kek = Buffer.from(
      hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), "tax-platform-kek", 32),
    );
  }

  async generateDataKey(): Promise<{ plaintextKey: Buffer; wrapped: Buffer; keyVersion: number }> {
    const plaintextKey = randomBytes(32);
    const wrapped = this.wrap(plaintextKey);
    return { plaintextKey, wrapped, keyVersion: KEY_VERSION };
  }

  async unwrapDataKey(wrapped: Buffer, keyVersion: number): Promise<Buffer> {
    if (keyVersion !== KEY_VERSION) {
      throw new Error(`Unsupported KEK version ${keyVersion} for LocalKmsProvider`);
    }
    return this.unwrap(wrapped);
  }

  private wrap(plaintext: Buffer): Buffer {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.kek, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([nonce, authTag, ciphertext]);
  }

  private unwrap(wrapped: Buffer): Buffer {
    const nonce = wrapped.subarray(0, NONCE_LENGTH);
    const authTag = wrapped.subarray(NONCE_LENGTH, NONCE_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = wrapped.subarray(NONCE_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", this.kek, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
