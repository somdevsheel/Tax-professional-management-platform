import { Inject, Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { KMS_PROVIDER, type KeyManagementProvider } from "../infra/kms/kms-provider.interface";

const NONCE_LENGTH = 12;

export interface EncryptedCredential {
  payloadCiphertext: Buffer;
  encryptionNonce: Buffer;
  wrappedDataKey: Buffer;
  keyVersion: number;
  algorithm: "AES-256-GCM";
}

export interface CredentialPlaintext {
  username: string;
  password: string;
}

/**
 * Envelope encryption for the credential vault: a fresh per-credential DEK (from the KMS
 * provider) encrypts the {username, password} payload with AES-256-GCM. The DEK is used only
 * for the instant of this operation and is zeroed afterwards — it is never persisted in the
 * clear (docs/security-design.md §5).
 */
@Injectable()
export class CredentialCryptoService {
  constructor(@Inject(KMS_PROVIDER) private readonly kms: KeyManagementProvider) {}

  async encrypt(plaintext: CredentialPlaintext): Promise<EncryptedCredential> {
    const { plaintextKey, wrapped, keyVersion } = await this.kms.generateDataKey();
    try {
      const nonce = randomBytes(NONCE_LENGTH);
      const cipher = createCipheriv("aes-256-gcm", plaintextKey, nonce);
      const payload = Buffer.from(JSON.stringify(plaintext), "utf8");
      const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return {
        payloadCiphertext: Buffer.concat([ciphertext, authTag]),
        encryptionNonce: nonce,
        wrappedDataKey: wrapped,
        keyVersion,
        algorithm: "AES-256-GCM",
      };
    } finally {
      plaintextKey.fill(0);
    }
  }

  async decrypt(record: {
    payloadCiphertext: Buffer;
    encryptionNonce: Buffer;
    wrappedDataKey: Buffer;
    keyVersion: number;
  }): Promise<CredentialPlaintext> {
    const plaintextKey = await this.kms.unwrapDataKey(record.wrappedDataKey, record.keyVersion);
    try {
      const authTag = record.payloadCiphertext.subarray(record.payloadCiphertext.length - 16);
      const ciphertext = record.payloadCiphertext.subarray(0, record.payloadCiphertext.length - 16);
      const decipher = createDecipheriv("aes-256-gcm", plaintextKey, record.encryptionNonce);
      decipher.setAuthTag(authTag);
      const payload = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(payload.toString("utf8")) as CredentialPlaintext;
    } finally {
      plaintextKey.fill(0);
    }
  }
}
