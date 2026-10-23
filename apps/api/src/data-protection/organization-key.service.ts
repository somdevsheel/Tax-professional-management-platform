import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { hkdfSync } from "node:crypto";
import { PrismaService } from "../infra/prisma/prisma.service";
import { KMS_PROVIDER, type KeyManagementProvider } from "../infra/kms/kms-provider.interface";

/** Unwrapped key material for one organization data key, split into purpose-bound subkeys so the
 *  same bytes are never used both to encrypt and to compute blind indexes. */
export interface OrganizationKey {
  keyId: string;
  encryptionKey: Buffer;
  indexKey: Buffer;
}

interface CacheEntry {
  key: OrganizationKey;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60_000;

/**
 * Owns the per-organization data keys that protect client PII (docs/security-design.md §5a).
 *
 * Unlike the credential vault's per-row DEKs (§5), client PII is read in bulk — a client list
 * page decrypts dozens of rows — so a per-row KMS unwrap would put the KMS on the hot path of
 * every list request. Instead each organization has one data key, unwrapped once and held in a
 * short-lived in-process cache. Expired entries are dropped, not zeroed: a request that fetched
 * the key just before expiry may still be mid-encryption with it, and zeroing those bytes under it
 * would silently encrypt with an all-zero key. Keys are per-organization, never global, so
 * one firm's key can never decrypt another firm's data, and deleting a firm's key rows
 * crypto-shreds everything encrypted under them.
 */
@Injectable()
export class OrganizationKeyService implements OnModuleDestroy {
  private readonly byId = new Map<string, CacheEntry>();
  private readonly activeByOrg = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(KMS_PROVIDER) private readonly kms: KeyManagementProvider,
  ) {}

  onModuleDestroy(): void {
    for (const entry of this.byId.values()) this.zero(entry.key);
    this.byId.clear();
    this.activeByOrg.clear();
  }

  /** The key new writes for this organization should use, creating the organization's first key
   *  on demand. */
  async getActiveKey(organizationId: string): Promise<OrganizationKey> {
    const cachedId = this.activeByOrg.get(organizationId);
    const cached = cachedId ? this.fromCache(cachedId) : null;
    if (cached) return cached;

    const row =
      (await this.prisma.organizationDataKey.findFirst({
        where: { organizationId },
        orderBy: { version: "desc" },
      })) ?? (await this.createFirstKey(organizationId));

    const key = await this.load(row);
    this.activeByOrg.set(organizationId, row.id);
    return key;
  }

  /** The key a stored ciphertext names. Scoped by organization as well as id, so a ciphertext
   *  row pointing at another tenant's key id is refused rather than decrypted. */
  async getKey(organizationId: string, keyId: string): Promise<OrganizationKey> {
    const cached = this.fromCache(keyId);
    if (cached) return cached;

    const row = await this.prisma.organizationDataKey.findFirst({ where: { id: keyId, organizationId } });
    if (!row) {
      throw new Error("Organization data key not found for this organization");
    }
    return this.load(row);
  }

  private async createFirstKey(organizationId: string) {
    const { plaintextKey, wrapped, keyVersion } = await this.kms.generateDataKey();
    plaintextKey.fill(0);
    try {
      return await this.prisma.organizationDataKey.create({
        data: { organizationId, version: 1, wrappedKey: wrapped, kekVersion: keyVersion },
      });
    } catch (err) {
      // Two concurrent first writes for the same organization: the unique (organization, version)
      // constraint lets exactly one key win, and the loser uses it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return this.prisma.organizationDataKey.findFirstOrThrow({ where: { organizationId, version: 1 } });
      }
      throw err;
    }
  }

  private async load(row: { id: string; wrappedKey: Buffer | Uint8Array; kekVersion: number }): Promise<OrganizationKey> {
    const master = await this.kms.unwrapDataKey(Buffer.from(row.wrappedKey), row.kekVersion);
    try {
      const key: OrganizationKey = {
        keyId: row.id,
        encryptionKey: this.derive(master, "client-pii-encryption"),
        indexKey: this.derive(master, "client-pii-blind-index"),
      };
      this.byId.set(row.id, { key, expiresAt: Date.now() + CACHE_TTL_MS });
      return key;
    } finally {
      master.fill(0);
    }
  }

  private derive(master: Buffer, purpose: string): Buffer {
    return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), `tax-platform:${purpose}:v1`, 32));
  }

  private fromCache(keyId: string): OrganizationKey | null {
    const entry = this.byId.get(keyId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.byId.delete(keyId);
      return null;
    }
    return entry.key;
  }

  private zero(key: OrganizationKey): void {
    key.encryptionKey.fill(0);
    key.indexKey.fill(0);
  }
}
