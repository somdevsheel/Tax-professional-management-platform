import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { ClientPiiService, type ClientPii } from "./client-pii.service";

const BATCH_SIZE = 200;

/**
 * Encrypts client/contact rows written before PII encryption existed (docs/security-design.md
 * §5a) and nulls their plaintext legacy_* columns. Runs on every boot before the API serves
 * requests, and is idempotent: once every row has a ciphertext it is a single empty query.
 *
 * Deliberately fails the boot if it can't finish — serving with some rows still in plaintext
 * would make those rows silently show as blank (reads only consult the ciphertext), which is
 * worse than not starting.
 */
@Injectable()
export class ClientPiiBackfillService implements OnModuleInit {
  private readonly logger = new Logger(ClientPiiBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: ClientPiiService,
  ) {}

  async onModuleInit(): Promise<void> {
    const clients = await this.backfillClients();
    const contacts = await this.backfillContacts();
    if (clients + contacts > 0) {
      this.logger.log(`Encrypted PII for ${clients} client(s) and ${contacts} contact(s) written before encryption.`);
    }
  }

  async backfillClients(): Promise<number> {
    let total = 0;
    for (;;) {
      const rows = await this.prisma.client.findMany({ where: { piiCiphertext: null }, take: BATCH_SIZE });
      if (rows.length === 0) return total;
      for (const row of rows) {
        const pii: ClientPii = {
          pan: row.legacyPan,
          gstin: row.legacyGstin,
          tan: row.legacyTan,
          cin: row.legacyCin,
          address: row.legacyAddress,
          email: row.legacyEmail,
          phone: row.legacyPhone,
          contactPerson: row.legacyContactPerson,
          notes: row.legacyNotes,
        };
        // `piiCiphertext: null` in the where makes this a no-op if another API instance
        // backfilled the same row first.
        await this.prisma.client.updateMany({
          where: { id: row.id, piiCiphertext: null },
          data: {
            ...(await this.pii.encryptClient(row.organizationId, row.id, pii)),
            legacyPan: null,
            legacyGstin: null,
            legacyTan: null,
            legacyCin: null,
            legacyAddress: Prisma.DbNull,
            legacyEmail: null,
            legacyPhone: null,
            legacyContactPerson: null,
            legacyNotes: null,
          },
        });
        total++;
      }
    }
  }

  async backfillContacts(): Promise<number> {
    let total = 0;
    for (;;) {
      const rows = await this.prisma.clientContact.findMany({
        where: { piiCiphertext: null },
        include: { client: { select: { organizationId: true } } },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) return total;
      for (const row of rows) {
        await this.prisma.clientContact.updateMany({
          where: { id: row.id, piiCiphertext: null },
          data: {
            ...(await this.pii.encryptContact(row.client.organizationId, row.clientId, row.id, {
              name: row.legacyName ?? "",
              role: row.legacyRole,
              email: row.legacyEmail,
              phone: row.legacyPhone,
            })),
            legacyName: null,
            legacyRole: null,
            legacyEmail: null,
            legacyPhone: null,
          },
        });
        total++;
      }
    }
  }
}
