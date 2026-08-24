/**
 * Envelope-encryption key management, abstracted so production can point at a real KMS/Vault
 * while local development uses a simple derived-key provider. Only "generate"/"wrap"/"unwrap"
 * operations cross this boundary — the KEK material itself never leaves the provider
 * implementation (docs/security-design.md §5).
 */
export interface KeyManagementProvider {
  /** Generates a fresh per-credential DEK and returns it both in the clear (for immediate use,
   *  never persisted) and wrapped by the current KEK (persisted). */
  generateDataKey(): Promise<{ plaintextKey: Buffer; wrapped: Buffer; keyVersion: number }>;

  /** Unwraps a previously wrapped DEK for decryption. */
  unwrapDataKey(wrapped: Buffer, keyVersion: number): Promise<Buffer>;
}

export const KMS_PROVIDER = Symbol("KMS_PROVIDER");
