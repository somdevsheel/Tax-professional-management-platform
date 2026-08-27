import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

describe("Reports (integration)", () => {
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

  it("summarizes clients, tasks, and compliance counts scoped to this organization only", async () => {
    const orgA = await registerFirm();
    const orgB = await registerFirm();
    const authA = { Authorization: `Bearer ${orgA.accessToken}` };
    const authB = { Authorization: `Bearer ${orgB.accessToken}` };

    await request(app.getHttpServer())
      .post("/api/v1/clients")
      .set(authA)
      .send({ name: "Org A Client", entityType: "INDIVIDUAL", status: "ACTIVE" });
    await request(app.getHttpServer())
      .post("/api/v1/tasks")
      .set(authA)
      .send({ title: "Overdue task", dueDate: "2020-01-01" });
    await request(app.getHttpServer()).post("/api/v1/tasks").set(authA).send({ title: "Task with no due date" });

    // Org B's own data must never leak into Org A's summary.
    await request(app.getHttpServer())
      .post("/api/v1/clients")
      .set(authB)
      .send({ name: "Org B Client", entityType: "INDIVIDUAL" });

    const summaryRes = await request(app.getHttpServer()).get("/api/v1/reports/summary").set(authA);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.clients.total).toBe(1);
    expect(summaryRes.body.data.clients.byStatus.ACTIVE).toBe(1);
    expect(summaryRes.body.data.tasks.total).toBe(2);
    expect(summaryRes.body.data.tasks.byStatus.TODO).toBe(2);
    expect(summaryRes.body.data.tasks.overdueCount).toBe(1);
    expect(summaryRes.body.data.compliance).toBeDefined();
    expect(summaryRes.body.data.documents).toBeDefined();
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/reports/summary");
    expect(res.status).toBe(401);
  });
});
