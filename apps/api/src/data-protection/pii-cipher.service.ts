import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { OrganizationKeyService } from "./organization-key.service";

const FORMAT_VERSION = 1;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Thrown when a stored PII ciphertext fails authentication: tampered bytes, a ciphertext copied
 *  from another row/tenant (the AAD no longer matches), or a missing/foreign key. */
export class PiiIntegrityError extends Error {
  constructor() {
    super("Stored personal data failed its integrity check");
    this.name = "PiiIntegrityError";
  }
}

/**
 * AES-256-GCM encryption of a JSON payload of personal data under an organization's data key
 * (docs/security-design.md §5a), plus keyed blind indexes for exact-match search.
 *
 * `context` is bound into every ciphertext as GCM additional authenticated data and must identify
 * the exact row it belongs to (e.g. `client:<orgId>:<clientId>`). Copying a ciphertext onto a
 * different row, or into a different tenant, therefore fails to decrypt rather than silently
 * showing one client's PAN on another client's page.
 *
 * Layout: version (1 byte) ‖ nonce (12) ‖ ciphertext ‖ GCM tag (16). A fresh random nonce per
 * encryption keeps nonce reuse under one long-lived org key negligible (well below the 2^32
 * messages-per-key bound for random 96-bit nonces).
 */
@Injectable()
export class PiiCipherService {
  constructor(private readonly keys: OrganizationKeyService) {}

  async encrypt(organizationId: string, context: string, payload: object): Promise<{ ciphertext: Buffer; keyId: string }> {
    const key = await this.keys.getActiveKey(organizationId);
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key.encryptionKey, nonce);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return {
      ciphertext: Buffer.concat([Buffer.from([FORMAT_VERSION]), nonce, body, cipher.getAuthTag()]),
      keyId: key.keyId,
    };
  }

  async decrypt<T>(organizationId: string, context: string, ciphertext: Buffer | Uint8Array, keyId: string): Promise<T> {
    const data = Buffer.from(ciphertext);
    if (data.length < 1 + NONCE_LENGTH + AUTH_TAG_LENGTH || data[0] !== FORMAT_VERSION) {
      throw new PiiIntegrityError();
    }
    try {
      const key = await this.keys.getKey(organizationId, keyId);
      const nonce = data.subarray(1, 1 + NONCE_LENGTH);
      const tag = data.subarray(data.length - AUTH_TAG_LENGTH);
      const body = data.subarray(1 + NONCE_LENGTH, data.length - AUTH_TAG_LENGTH);
      const decipher = createDecipheriv("aes-256-gcm", key.encryptionKey, nonce);
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
      return JSON.parse(plaintext.toString("utf8")) as T;
    } catch {
      throw new PiiIntegrityError();
    }
  }

  /**
   * Deterministic keyed HMAC of a normalized identifier, for exact-match lookup without storing
   * the value. Keyed per organization (the same PAN at two firms yields unrelated indexes) and
   * per field (a PAN and an identical-looking TAN don't collide). Returns null for an empty
   * value so "no PAN" is never indexed as a searchable value.
   */
  async blindIndex(organizationId: string, field: string, value: string | null | undefined): Promise<Buffer | null> {
    const normalized = normalizeIdentifier(value);
    if (!normalized) return null;
    const key = await this.keys.getActiveKey(organizationId);
    return createHmac("sha256", key.indexKey).update(`${field}:${normalized}`, "utf8").digest();
  }
}

/** Identifiers (PAN/GSTIN/TAN/CIN) are case-insensitive and commonly typed with stray spaces. */
export function normalizeIdentifier(value: string | null | undefined): string | null {
  const normalized = (value ?? "").replace(/\s+/g, "").toUpperCase();
  return normalized.length > 0 ? normalized : null;
}
