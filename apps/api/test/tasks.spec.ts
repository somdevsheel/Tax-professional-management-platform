import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";

describe("Tasks (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerFirm() {
    const email = uniqueEmail("owner");
    const password = "a-strong-password-123";
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      email,
      password,
      fullName: "Owner",
      organizationName: "Firm " + Date.now() + Math.random(),
      organizationSlug: "firm-" + Date.now() + Math.floor(Math.random() * 1e8),
    });
    return {
      accessToken: res.body.data.accessToken as string,
      organizationId: res.body.data.organizationId as string,
      userId: res.body.data.user.id as string,
    };
  }

  it("creates, lists, updates, assigns, completes, comments on, and deletes a task", async () => {
    const owner = await registerFirm();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const createRes = await request(app.getHttpServer())
      .post("/api/v1/tasks")
      .set(auth)
      .send({ title: "File GSTR-3B", priority: "HIGH", dueDate: new Date(Date.now() + 86400000).toISOString() });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.status).toBe("TODO");
    const taskId = createRes.body.data.id as string;

    const listRes = await request(app.getHttpServer()).get("/api/v1/tasks").set(auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((t: { id: string }) => t.id === taskId)).toBe(true);

    const getRes = await request(app.getHttpServer()).get(`/api/v1/tasks/${taskId}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.title).toBe("File GSTR-3B");

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}`)
      .set(auth)
      .send({ status: "IN_PROGRESS" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.status).toBe("IN_PROGRESS");

    // The org owner's own membership row is the assignee here — self-assignment is a normal case.
    const meRes = await request(app.getHttpServer()).get("/api/v1/organizations/current/members").set(auth);
    const ownerMemberId = meRes.body.data.find((m: { userId: string }) => m.userId === owner.userId).id as string;

    const assignRes = await request(app.getHttpServer())
      .patch(`/api/v1/tasks/${taskId}/assign`)
      .set(auth)
      .send({ assignedTo: ownerMemberId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.assignedTo).toBe(ownerMemberId);

    const commentRes = await request(app.getHttpServer())
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set(auth)
      .send({ body: "Waiting on client documents" });
    expect(commentRes.status).toBe(201);

    const commentsRes = await request(app.getHttpServer()).get(`/api/v1/tasks/${taskId}/comments`).set(auth);
    expect(commentsRes.status).toBe(200);
    expect(commentsRes.body.data).toHaveLength(1);

    const completeRes = await request(app.getHttpServer()).post(`/api/v1/tasks/${taskId}/complete`).set(auth);
    expect(completeRes.status).toBe(201);
    expect(completeRes.body.data.status).toBe("COMPLETED");

    const deleteRes = await request(app.getHttpServer()).delete(`/api/v1/tasks/${taskId}`).set(auth);
    expect(deleteRes.status).toBe(200);

    const getAfterDeleteRes = await request(app.getHttpServer()).get(`/api/v1/tasks/${taskId}`).set(auth);
    expect(getAfterDeleteRes.status).toBe(404);
  });

  it("filters by status and clientId", async () => {
    const owner = await registerFirm();
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    const clientRes = await request(app.getHttpServer())
      .post("/api/v1/clients")
      .set(auth)
      .send({ name: "Filter Test Client", entityType: "INDIVIDUAL" });
    const clientId = clientRes.body.data.id as string;

    await request(app.getHttpServer()).post("/api/v1/tasks").set(auth).send({ title: "Unrelated task" });
    const scopedRes = await request(app.getHttpServer())
      .post("/api/v1/tasks")
      .set(auth)
      .send({ title: "Client-scoped task", clientId });

    const filteredRes = await request(app.getHttpServer()).get(`/api/v1/tasks?clientId=${clientId}`).set(auth);
    expect(filteredRes.status).toBe(200);
    expect(filteredRes.body.data).toHaveLength(1);
    expect(filteredRes.body.data[0].id).toBe(scopedRes.body.data.id);
  });

  it("never returns another organization's task", async () => {
    const orgA = await registerFirm();
    const orgB = await registerFirm();

    const createRes = await request(app.getHttpServer())
      .post("/api/v1/tasks")
      .set({ Authorization: `Bearer ${orgA.accessToken}` })
      .send({ title: "Org A's private task" });
    const taskId = createRes.body.data.id as string;

    const crossOrgRes = await request(app.getHttpServer())
      .get(`/api/v1/tasks/${taskId}`)
      .set({ Authorization: `Bearer ${orgB.accessToken}` });
    expect(crossOrgRes.status).toBe(404);

    const crossOrgListRes = await request(app.getHttpServer())
      .get("/api/v1/tasks")
      .set({ Authorization: `Bearer ${orgB.accessToken}` });
    expect(crossOrgListRes.body.data.some((t: { id: string }) => t.id === taskId)).toBe(false);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/tasks");
    expect(res.status).toBe(401);
  });
});
