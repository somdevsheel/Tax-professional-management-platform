import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

// A real, minimal, valid PDF — not a fake extension. file-type sniffs magic bytes, so an upload
// this test wants to succeed has to actually satisfy the sniffer, not just have a plausible name.
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

// The EICAR test string (see infra/antivirus/noop-antivirus.provider.ts) — standardised,
// deliberately harmless, and exactly what every real antivirus product is designed to flag
// under this name. Used here to prove the "an infected upload gets rejected, not stored" path
// actually works end to end, not just that the code compiles.
const EICAR_TEST_FILE = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");

describe("Documents (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerFirm() {
    const email = uniqueEmail("owner");
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password: "a-strong-password-123",
      fullName: "Owner",
      organizationName: "Firm " + Date.now() + Math.random(),
      organizationSlug: "firm-" + Date.now() + Math.floor(Math.random() * 1e8),
    });
    return { accessToken: res.body.data.accessToken as string };
  }

  it("uploads a document, lists it, gets a download URL, and deletes it", async () => {
    const owner = await registerFirm();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const uploadRes = await request(app.getHttpServer())
      .post("/api/v1/documents")
      .set(auth)
      .attach("file", MINIMAL_PDF, { filename: "test-doc.pdf", contentType: "application/pdf" })
      .field("tags", "engagement-letter, 2026");
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.mimeType).toBe("application/pdf");
    expect(uploadRes.body.data.tags).toEqual(["engagement-letter", "2026"]);
    expect(uploadRes.body.data.checksumSha256).toHaveLength(64);
    const documentId = uploadRes.body.data.id as string;

    const listRes = await request(app.getHttpServer()).get("/api/v1/documents").set(auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((d: { id: string }) => d.id === documentId)).toBe(true);

    const downloadRes = await request(app.getHttpServer()).get(`/api/v1/documents/${documentId}/download`).set(auth);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.body.data.url).toMatch(/^http/);

    const deleteRes = await request(app.getHttpServer()).delete(`/api/v1/documents/${documentId}`).set(auth);
    expect(deleteRes.status).toBe(200);

    const getAfterDeleteRes = await request(app.getHttpServer()).get(`/api/v1/documents/${documentId}`).set(auth);
    expect(getAfterDeleteRes.status).toBe(404);
  });

  it("uploads a document scoped to a client", async () => {
    const owner = await registerFirm();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const clientRes = await request(app.getHttpServer())
      .post("/api/v1/clients")
      .set(auth)
      .send({ name: "Document Test Client", entityType: "INDIVIDUAL" });
    const clientId = clientRes.body.data.id as string;

    const uploadRes = await request(app.getHttpServer())
      .post(`/api/v1/clients/${clientId}/documents`)
      .set(auth)
      .attach("file", MINIMAL_PDF, { filename: "pan-card.pdf", contentType: "application/pdf" });
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.clientId).toBe(clientId);

    const listForClientRes = await request(app.getHttpServer()).get(`/api/v1/clients/${clientId}/documents`).set(auth);
    expect(listForClientRes.status).toBe(200);
    expect(listForClientRes.body.data).toHaveLength(1);
  });

  it("rejects an upload that fails the antivirus scan and never stores it", async () => {
    const owner = await registerFirm();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const uploadRes = await request(app.getHttpServer())
      .post("/api/v1/documents")
      .set(auth)
      .attach("file", EICAR_TEST_FILE, { filename: "eicar.txt", contentType: "text/plain" });
    expect(uploadRes.status).toBe(400);

    const listRes = await request(app.getHttpServer()).get("/api/v1/documents").set(auth);
    expect(listRes.body.data.some((d: { fileName: string }) => d.fileName === "eicar.txt")).toBe(false);
  });

  it("rejects a file whose sniffed type isn't in the allow-list", async () => {
    const owner = await registerFirm();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    // A minimal ELF header — a real executable's magic bytes, not something anyone should be
    // able to upload regardless of what filename/Content-Type the client claims.
    const fakeExecutable = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);

    const uploadRes = await request(app.getHttpServer())
      .post("/api/v1/documents")
      .set(auth)
      .attach("file", fakeExecutable, { filename: "totally-a-pdf.pdf", contentType: "application/pdf" });
    expect(uploadRes.status).toBe(400);
  });

  it("never returns another organization's document", async () => {
    const orgA = await registerFirm();
    const orgB = await registerFirm();

    const uploadRes = await request(app.getHttpServer())
      .post("/api/v1/documents")
      .set({ Authorization: `Bearer ${orgA.accessToken}` })
      .attach("file", MINIMAL_PDF, { filename: "org-a-private.pdf", contentType: "application/pdf" });
    const documentId = uploadRes.body.data.id as string;

    const crossOrgRes = await request(app.getHttpServer())
      .get(`/api/v1/documents/${documentId}`)
      .set({ Authorization: `Bearer ${orgB.accessToken}` });
    expect(crossOrgRes.status).toBe(404);
  });

  it("rejects an unauthenticated upload", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/documents")
      .attach("file", MINIMAL_PDF, { filename: "test.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(401);
  });
});
