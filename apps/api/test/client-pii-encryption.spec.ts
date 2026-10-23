import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { ClientPiiBackfillService } from "../src/clients/client-pii-backfill.service";

/** docs/security-design.md §5a — client PII is stored only as ciphertext. */
describe("Client PII encryption at rest (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerFirm() {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: uniqueEmail("pii"),
        password: "a-strong-password-123",
        fullName: "PII Owner",
        organizationName: "PII Firm " + Date.now() + Math.random(),
        organizationSlug: "pii-firm-" + Date.now() + Math.floor(Math.random() * 1e8),
      });
    return { token: res.body.data.accessToken as string, organizationId: res.body.data.organizationId as string };
  }

  const SAMPLE = {
    name: "Sensitive Exports Pvt Ltd",
    entityType: "PRIVATE_LIMITED",
    pan: "ABCPE9876K",
    gstin: "27ABCPE9876K1Z3",
    email: "director@sensitive.test",
    phone: "+91 98200 12345",
    contactPerson: "Anita Rao",
    address: { line1: "12 Marine Drive", city: "Mumbai" },
    notes: "Promoter's DIN is 01234567",
  };

  async function createClient(token: string, body: object = SAMPLE) {
    const res = await request(app.getHttpServer()).post("/api/v1/clients").set("Authorization", `Bearer ${token}`).send(body);
    expect(res.status).toBe(201);
    return res.body.data as Record<string, unknown> & { id: string };
  }

  /** The raw `clients` row as Postgres holds it, every column rendered to text. */
  async function rawRow(clientId: string): Promise<string> {
    const rows = await prisma.$queryRaw<Array<{ row: string }>>`SELECT row_to_json(c)::text AS row FROM clients c WHERE id = ${clientId}`;
    return rows[0].row;
  }

  it("stores no PII in plaintext anywhere in the database row, but returns it decrypted", async () => {
    const firm = await registerFirm();
    const client = await createClient(firm.token);

    expect(client).toMatchObject({ pan: SAMPLE.pan, gstin: SAMPLE.gstin, email: SAMPLE.email, address: SAMPLE.address });
    for (const key of Object.keys(client)) {
      expect(key).not.toMatch(/pii|Index|^legacy/);
    }

    const row = await rawRow(client.id);
    for (const secret of [SAMPLE.pan, SAMPLE.gstin, SAMPLE.email, SAMPLE.phone, SAMPLE.contactPerson, "Marine Drive", "01234567"]) {
      expect(row).not.toContain(secret);
    }
    expect(row).toContain(SAMPLE.name); // name stays plaintext by design (sorting/search across modules)
    // row_to_json renders bytea as hex, so also check the ciphertext's raw bytes directly.
    const stored = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    const ciphertext = Buffer.from(stored.piiCiphertext!);
    for (const secret of [SAMPLE.pan, SAMPLE.email, "Anita"]) {
      expect(ciphertext.includes(Buffer.from(secret))).toBe(false);
    }

    const fetched = await request(app.getHttpServer()).get(`/api/v1/clients/${client.id}`).set("Authorization", `Bearer ${firm.token}`);
    expect(fetched.body.data).toMatchObject({ pan: SAMPLE.pan, phone: SAMPLE.phone, notes: SAMPLE.notes });
  });

  it("finds clients by a full identifier in any case, but not by a fragment of one", async () => {
    const firm = await registerFirm();
    const client = await createClient(firm.token);
    const search = (q: string) =>
      request(app.getHttpServer()).get(`/api/v1/clients?search=${encodeURIComponent(q)}`).set("Authorization", `Bearer ${firm.token}`);

    for (const q of [SAMPLE.pan, SAMPLE.pan.toLowerCase(), SAMPLE.gstin, "Sensitive Exports"]) {
      const res = await search(q);
      expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([client.id]);
    }
    expect((await search("ABCPE")).body.data).toHaveLength(0);
  });

  it("keys blind indexes per organization, so the same PAN at two firms is unlinkable", async () => {
    const firmA = await registerFirm();
    const firmB = await registerFirm();
    const a = await createClient(firmA.token);
    const b = await createClient(firmB.token);

    const [rowA, rowB] = await Promise.all([
      prisma.client.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.client.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(Buffer.from(rowA.panIndex!).equals(Buffer.from(rowB.panIndex!))).toBe(false);
    expect(rowA.piiKeyId).not.toBe(rowB.piiKeyId);
  });

  it("refuses to decrypt a ciphertext copied onto another client, within or across firms", async () => {
    const firmA = await registerFirm();
    const firmB = await registerFirm();
    const source = await createClient(firmA.token);
    const sameFirmTarget = await createClient(firmA.token, { name: "Other Co", entityType: "LLP", pan: "ZZZPZ1111Z" });
    const otherFirmTarget = await createClient(firmB.token, { name: "Victim Co", entityType: "LLP" });
    const stolen = await prisma.client.findUniqueOrThrow({ where: { id: source.id } });

    for (const [target, token] of [
      [sameFirmTarget, firmA.token],
      [otherFirmTarget, firmB.token],
    ] as const) {
      await prisma.client.update({
        where: { id: target.id },
        data: { piiCiphertext: stolen.piiCiphertext, piiKeyId: stolen.piiKeyId },
      });
      const res = await request(app.getHttpServer()).get(`/api/v1/clients/${target.id}`).set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain(SAMPLE.pan);
    }
  });

  it("partially updates PII without losing the fields it didn't touch", async () => {
    const firm = await registerFirm();
    const client = await createClient(firm.token);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/clients/${client.id}`)
      .set("Authorization", `Bearer ${firm.token}`)
      .send({ phone: "+91 90000 00000", notes: null });
    expect(res.body.data).toMatchObject({ pan: SAMPLE.pan, gstin: SAMPLE.gstin, phone: "+91 90000 00000", notes: null });
    expect(await rawRow(client.id)).not.toContain("90000 00000");
  });

  it("encrypts client contacts", async () => {
    const firm = await registerFirm();
    const client = await createClient(firm.token);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/clients/${client.id}/contacts`)
      .set("Authorization", `Bearer ${firm.token}`)
      .send({ name: "Vikram Shah", role: "CFO", email: "cfo@sensitive.test", phone: "+91 99999 11111" });
    expect(res.body.data).toMatchObject({ name: "Vikram Shah", email: "cfo@sensitive.test" });

    const rows = await prisma.$queryRaw<Array<{ row: string }>>`SELECT row_to_json(c)::text AS row FROM client_contacts c WHERE client_id = ${client.id}`;
    expect(rows[0].row).not.toContain("Vikram");
    expect(rows[0].row).not.toContain("cfo@sensitive.test");

    const list = await request(app.getHttpServer()).get(`/api/v1/clients/${client.id}/contacts`).set("Authorization", `Bearer ${firm.token}`);
    expect(list.body.data[0]).toMatchObject({ name: "Vikram Shah", role: "CFO" });
  });

  it("backfills rows written before encryption existed and clears their plaintext", async () => {
    const firm = await registerFirm();
    const client = await createClient(firm.token, { name: "Legacy Co", entityType: "INDIVIDUAL" });
    // Simulate a pre-encryption row: plaintext only in legacy_* columns, no ciphertext.
    await prisma.$executeRaw`UPDATE clients SET pii_ciphertext = NULL, pii_key_id = NULL, pan_bidx = NULL,
      legacy_pan = 'LEGPA1234L', legacy_email = 'old@legacy.test', legacy_address = '{"city":"Pune"}'::jsonb
      WHERE id = ${client.id}`;

    await app.get(ClientPiiBackfillService).backfillClients();

    const row = await rawRow(client.id);
    expect(row).not.toContain("LEGPA1234L");
    expect(row).not.toContain("old@legacy.test");
    expect(row).not.toContain("Pune");
    const res = await request(app.getHttpServer()).get(`/api/v1/clients?search=legpa1234l`).set("Authorization", `Bearer ${firm.token}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ pan: "LEGPA1234L", email: "old@legacy.test", address: { city: "Pune" } });
  });
});
