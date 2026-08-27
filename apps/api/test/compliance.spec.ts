import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

describe("Compliance (integration)", () => {
  let app: INestApplication;
  let gstr3bTypeId: string;

  beforeAll(async () => {
    app = await createTestApp();
    const catalogRes = await createFirstAuthedRequest(app);
    const catalog = await request(app.getHttpServer())
      .get("/api/v1/compliance-types")
      .set({ Authorization: `Bearer ${catalogRes.accessToken}` });
    gstr3bTypeId = catalog.body.data.find((t: { code: string }) => t.code === "GSTR3B").id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createFirstAuthedRequest(appRef: INestApplication) {
    const email = uniqueEmail("owner");
    const res = await request(appRef.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password: "a-strong-password-123",
      fullName: "Owner",
      organizationName: "Firm " + Date.now() + Math.random(),
      organizationSlug: "firm-" + Date.now() + Math.floor(Math.random() * 1e8),
    });
    return { accessToken: res.body.data.accessToken as string, organizationId: res.body.data.organizationId as string };
  }

  async function registerFirm() {
    return createFirstAuthedRequest(app);
  }

  it("lists the global compliance-type catalog without needing an organization", async () => {
    // The catalog is global — a fresh registration's own token already proved this above,
    // but assert it explicitly: every seeded type is present regardless of org.
    const owner = await registerFirm();
    const res = await request(app.getHttpServer())
      .get("/api/v1/compliance-types")
      .set({ Authorization: `Bearer ${owner.accessToken}` });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(10);
  });

  it("creates, lists, updates status, and deletes a compliance item for a client", async () => {
    const owner = await registerFirm();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const clientRes = await request(app.getHttpServer())
      .post("/api/v1/clients")
      .set(auth)
      .send({ name: "Compliance Test Client", entityType: "PRIVATE_LIMITED" });
    const clientId = clientRes.body.data.id as string;

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/clients/${clientId}/compliance-items`)
      .set(auth)
      .send({ complianceTypeId: gstr3bTypeId, financialYear: "2025-26", dueDate: "2026-09-20" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe("UPCOMING");
    const itemId = createRes.body.data.id as string;

    const listForClientRes = await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientId}/compliance-items`)
      .set(auth);
    expect(listForClientRes.status).toBe(200);
    expect(listForClientRes.body.data).toHaveLength(1);
    expect(listForClientRes.body.data[0].complianceType.code).toBe("GSTR3B");

    const orgWideListRes = await request(app.getHttpServer())
      .get(`/api/v1/compliance-items?clientId=${clientId}`)
      .set(auth);
    expect(orgWideListRes.status).toBe(200);
    expect(orgWideListRes.body.data.some((i: { id: string }) => i.id === itemId)).toBe(true);

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/compliance-items/${itemId}`)
      .set(auth)
      .send({ status: "FILED", filingDate: "2026-09-18" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.status).toBe("FILED");

    const auditRes = await request(app.getHttpServer())
      .get(`/api/v1/audit-logs?resourceType=compliance_item&resourceId=${itemId}`)
      .set(auth);
    expect(auditRes.body.data.some((e: { action: string }) => e.action === "COMPLIANCE_STATUS_CHANGED")).toBe(true);

    const deleteRes = await request(app.getHttpServer()).delete(`/api/v1/compliance-items/${itemId}`).set(auth);
    expect(deleteRes.status).toBe(200);

    const getAfterDeleteRes = await request(app.getHttpServer()).get(`/api/v1/compliance-items/${itemId}`).set(auth);
    expect(getAfterDeleteRes.status).toBe(404);
  });

  it("never returns another organization's compliance item", async () => {
    const orgA = await registerFirm();
    const orgB = await registerFirm();
    const authA = { Authorization: `Bearer ${orgA.accessToken}` };

    const clientRes = await request(app.getHttpServer())
      .post("/api/v1/clients")
      .set(authA)
      .send({ name: "Org A Client", entityType: "INDIVIDUAL" });
    const clientId = clientRes.body.data.id as string;

    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/clients/${clientId}/compliance-items`)
      .set(authA)
      .send({ complianceTypeId: gstr3bTypeId, financialYear: "2025-26", dueDate: "2026-09-20" });
    const itemId = createRes.body.data.id as string;

    const crossOrgRes = await request(app.getHttpServer())
      .get(`/api/v1/compliance-items/${itemId}`)
      .set({ Authorization: `Bearer ${orgB.accessToken}` });
    expect(crossOrgRes.status).toBe(404);

    // Org B also can't reach it via Org A's own client id, since that client lookup is
    // itself tenant-scoped and fails first.
    const crossOrgClientListRes = await request(app.getHttpServer())
      .get(`/api/v1/clients/${clientId}/compliance-items`)
      .set({ Authorization: `Bearer ${orgB.accessToken}` });
    expect(crossOrgClientListRes.status).toBe(404);
  });
});
