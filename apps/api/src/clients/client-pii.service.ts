import { HttpStatus, Injectable } from "@nestjs/common";
import type { Client, ClientContact, Prisma } from "@prisma/client";
import { PiiCipherService, PiiIntegrityError, normalizeIdentifier } from "../data-protection/pii-cipher.service";
import { AppError } from "../common/errors/app-error";

/** The client fields that are personal/identifying data and are stored only encrypted. */
export const CLIENT_PII_FIELDS = ["pan", "gstin", "tan", "cin", "address", "email", "phone", "contactPerson", "notes"] as const;
export type ClientPiiField = (typeof CLIENT_PII_FIELDS)[number];
export type ClientPii = { [K in ClientPiiField]: K extends "address" ? Prisma.JsonValue | null : string | null };

/** Identifier fields that also get a blind index so they stay searchable. */
export const SEARCHABLE_IDENTIFIERS = ["pan", "gstin", "tan", "cin"] as const;
const INDEX_COLUMN = { pan: "panIndex", gstin: "gstinIndex", tan: "tanIndex", cin: "cinIndex" } as const;

export const CONTACT_PII_FIELDS = ["name", "role", "email", "phone"] as const;
export type ContactPii = { name: string; role: string | null; email: string | null; phone: string | null };

/** Columns that must never leave the API — ciphertext, key references, blind indexes, and the
 *  pre-encryption legacy columns. */
const INTERNAL_CLIENT_COLUMNS = [
  "piiCiphertext",
  "piiKeyId",
  "panIndex",
  "gstinIndex",
  "tanIndex",
  "cinIndex",
  "legacyPan",
  "legacyGstin",
  "legacyTan",
  "legacyCin",
  "legacyAddress",
  "legacyEmail",
  "legacyPhone",
  "legacyContactPerson",
  "legacyNotes",
] as const;
const INTERNAL_CONTACT_COLUMNS = ["piiCiphertext", "piiKeyId", "legacyName", "legacyRole", "legacyEmail", "legacyPhone"] as const;

type InternalClientColumn = (typeof INTERNAL_CLIENT_COLUMNS)[number];
export type ClientView = Omit<Client, InternalClientColumn> & ClientPii;
export type ContactView = Omit<ClientContact, (typeof INTERNAL_CONTACT_COLUMNS)[number]> & ContactPii;

const EMPTY_CLIENT_PII: ClientPii = {
  pan: null,
  gstin: null,
  tan: null,
  cin: null,
  address: null,
  email: null,
  phone: null,
  contactPerson: null,
  notes: null,
};

const clientContext = (organizationId: string, clientId: string) => `client:${organizationId}:${clientId}`;
const contactContext = (organizationId: string, clientId: string, contactId: string) =>
  `client-contact:${organizationId}:${clientId}:${contactId}`;

/**
 * Translates between the API's plaintext client shape and the encrypted columns it's stored as
 * (docs/security-design.md §5a). Every client/contact row returned to a caller goes through
 * `toClientView`/`toContactView`, which strip every internal column — so nothing encrypted,
 * indexed, or legacy can leak by being spread into a response.
 */
@Injectable()
export class ClientPiiService {
  constructor(private readonly cipher: PiiCipherService) {}

  /** Column values to persist for a client's PII: the ciphertext, its key, and blind indexes. */
  async encryptClient(organizationId: string, clientId: string, pii: ClientPii) {
    const { ciphertext, keyId } = await this.cipher.encrypt(organizationId, clientContext(organizationId, clientId), pii);
    const indexes: Record<string, Buffer | null> = {};
    for (const field of SEARCHABLE_IDENTIFIERS) {
      indexes[INDEX_COLUMN[field]] = await this.cipher.blindIndex(organizationId, field, pii[field]);
    }
    return {
      piiCiphertext: ciphertext,
      piiKeyId: keyId,
      ...(indexes as Record<(typeof INDEX_COLUMN)[keyof typeof INDEX_COLUMN], Buffer | null>),
    };
  }

  async decryptClient(row: Pick<Client, "id" | "organizationId" | "piiCiphertext" | "piiKeyId">): Promise<ClientPii> {
    if (!row.piiCiphertext || !row.piiKeyId) return { ...EMPTY_CLIENT_PII };
    try {
      const pii = await this.cipher.decrypt<Partial<ClientPii>>(
        row.organizationId,
        clientContext(row.organizationId, row.id),
        row.piiCiphertext,
        row.piiKeyId,
      );
      return { ...EMPTY_CLIENT_PII, ...pii };
    } catch (err) {
      throw this.integrityFailure(err);
    }
  }

  async toClientView<T extends Client>(row: T): Promise<Omit<T, InternalClientColumn> & ClientPii> {
    const pii = await this.decryptClient(row);
    const view: Record<string, unknown> = { ...row };
    for (const column of INTERNAL_CLIENT_COLUMNS) delete view[column];
    return { ...(view as Omit<T, InternalClientColumn>), ...pii };
  }

  async encryptContact(organizationId: string, clientId: string, contactId: string, pii: ContactPii) {
    const { ciphertext, keyId } = await this.cipher.encrypt(
      organizationId,
      contactContext(organizationId, clientId, contactId),
      pii,
    );
    return { piiCiphertext: ciphertext, piiKeyId: keyId };
  }

  async toContactView(organizationId: string, row: ClientContact): Promise<ContactView> {
    let pii: ContactPii = { name: "", role: null, email: null, phone: null };
    if (row.piiCiphertext && row.piiKeyId) {
      try {
        pii = await this.cipher.decrypt<ContactPii>(
          organizationId,
          contactContext(organizationId, row.clientId, row.id),
          row.piiCiphertext,
          row.piiKeyId,
        );
      } catch (err) {
        throw this.integrityFailure(err);
      }
    }
    const view: Record<string, unknown> = { ...row };
    for (const column of INTERNAL_CONTACT_COLUMNS) delete view[column];
    return { ...(view as Omit<ClientContact, (typeof INTERNAL_CONTACT_COLUMNS)[number]>), ...pii };
  }

  /** Blind indexes to match a free-text search against, one per searchable identifier. Returns
   *  an empty list for input that can't be an identifier, so name-only searches don't pay for
   *  four HMACs. */
  async searchIndexes(organizationId: string, search: string): Promise<Prisma.ClientWhereInput[]> {
    const normalized = normalizeIdentifier(search);
    if (!normalized || !/^[A-Z0-9]+$/.test(normalized)) return [];
    const clauses: Prisma.ClientWhereInput[] = [];
    for (const field of SEARCHABLE_IDENTIFIERS) {
      const index = await this.cipher.blindIndex(organizationId, field, normalized);
      if (index) clauses.push({ [INDEX_COLUMN[field]]: index });
    }
    return clauses;
  }

  private integrityFailure(err: unknown): unknown {
    if (err instanceof PiiIntegrityError) {
      return new AppError("CLIENT_DATA_INTEGRITY", "This client's stored data could not be verified", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return err;
  }
}
