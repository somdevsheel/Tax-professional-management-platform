import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { PasswordService } from "../src/auth/password.service";
import { DeadlineSweepService } from "../src/notifications/deadline-sweep.service";
import { startOfTodayIst } from "../src/common/dates";

describe("Compliance calendar & deadline notifications (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sweep: DeadlineSweepService;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    sweep = app.get(DeadlineSweepService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerFirm() {
    const res = await api()
      .post("/api/v1/auth/register")
      .send({
        email: uniqueEmail("cal"),
        password: "a-strong-password-123",
        fullName: "Calendar Owner",
        organizationName: "Calendar Firm " + Date.now() + Math.random(),
        organizationSlug: "cal-firm-" + Date.now() + Math.floor(Math.random() * 1e8),
      });
    return {
      token: res.body.data.accessToken as string,
      organizationId: res.body.data.organizationId as string,
      userId: res.body.data.user.id as string,
    };
  }

  /** Adds an ACTIVE STAFF member to the firm and signs them in. */
  async function addStaffMember(organizationId: string) {
    const email = uniqueEmail("staff");
    const password = "a-staff-password-123";
    const user = await prisma.user.create({
      data: { email, fullName: "Staff Member", status: "ACTIVE", passwordHash: await app.get(PasswordService).hash(password) },
    });
    const role = await prisma.role.findFirstOrThrow({ where: { organizationId: null, name: "STAFF" } });
    const member = await prisma.organizationMember.create({
      data: { organizationId, userId: user.id, roleId: role.id, status: "ACTIVE", joinedAt: new Date() },
    });
    const login = await api().post("/api/v1/auth/login").send({ email, password });
    return { userId: user.id, memberId: member.id, token: login.body.data.accessToken as string };
  }

  async function createClient(token: string, body: object) {
    const res = await api().post("/api/v1/clients").set("Authorization", `Bearer ${token}`).send(body);
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }

  async function catalogIds(token: string) {
    const res = await api().get("/api/v1/compliance-types").set("Authorization", `Bearer ${token}`);
    return Object.fromEntries(res.body.data.map((t: { code: string; id: string }) => [t.code, t.id])) as Record<string, string>;
  }

  it("suggests filings from the client's data", async () => {
    const firm = await registerFirm();
    const clientId = await createClient(firm.token, { name: "GST Co", entityType: "PRIVATE_LIMITED", gstin: "27AAACG1234K1Z5" });

    const res = await api().get(`/api/v1/clients/${clientId}/compliance-plan?financialYear=2030-31`).set("Authorization", `Bearer ${firm.token}`);
    expect(res.status).toBe(200);
    const suggested = res.body.data.filter((p: { suggested: boolean }) => p.suggested).map((p: { complianceType: { code: string } }) => p.complianceType.code);
    expect(suggested.sort()).toEqual(["ADVANCE_TAX", "AOC4", "GSTR1", "GSTR3B", "GSTR9", "ITR", "MGT7"]);
    const gstr3b = res.body.data.find((p: { complianceType: { code: string } }) => p.complianceType.code === "GSTR3B");
    expect(gstr3b).toMatchObject({ periods: 12, tracked: 0, reason: "Client has a GSTIN on file" });
  });

  it("generates a year's filings with correct periods and dates, and never duplicates them", async () => {
    const firm = await registerFirm();
    const ids = await catalogIds(firm.token);
    const clientId = await createClient(firm.token, { name: "Calendar Co", entityType: "LLP" });
    const generate = () =>
      api()
        .post(`/api/v1/clients/${clientId}/compliance-items/generate`)
        .set("Authorization", `Bearer ${firm.token}`)
        .send({ financialYear: "2030-31", complianceTypeIds: [ids.GSTR3B, ids.TDS_26Q] });

    const first = await generate();
    expect(first.status).toBe(201);
    expect(first.body.data).toEqual({ created: 16, alreadyTracked: 0, skippedPastDue: 0 });
    expect((await generate()).body.data).toEqual({ created: 0, alreadyTracked: 16, skippedPastDue: 0 });

    const items = await prisma.complianceItem.findMany({ where: { clientId }, orderBy: { dueDate: "asc" } });
    expect(items).toHaveLength(16);
    const q3 = items.find((i) => i.complianceTypeId === ids.TDS_26Q && i.period === "Q3")!;
    expect(q3.dueDate.toISOString().slice(0, 10)).toBe("2031-01-31");
    expect(q3).toMatchObject({ financialYear: "2030-31", assessmentYear: "2031-32", status: "UPCOMING" });

    const audit = await prisma.auditLog.findFirst({ where: { resourceId: clientId, action: "COMPLIANCE_CALENDAR_GENERATED" } });
    expect(audit).not.toBeNull();
  });

  it("skips past-due filings unless asked, and creates them as OVERDUE when asked", async () => {
    const firm = await registerFirm();
    const ids = await catalogIds(firm.token);
    const clientId = await createClient(firm.token, { name: "Old Year Co", entityType: "INDIVIDUAL" });
    const send = (includePastDue: boolean) =>
      api()
        .post(`/api/v1/clients/${clientId}/compliance-items/generate`)
        .set("Authorization", `Bearer ${firm.token}`)
        .send({ financialYear: "2020-21", complianceTypeIds: [ids.ITR], includePastDue });

    expect((await send(false)).body.data).toEqual({ created: 0, alreadyTracked: 0, skippedPastDue: 1 });
    expect((await send(true)).body.data).toEqual({ created: 1, alreadyTracked: 0, skippedPastDue: 0 });
    expect((await prisma.complianceItem.findFirstOrThrow({ where: { clientId } })).status).toBe("OVERDUE");
  });

  it("rejects malformed financial years and another firm's client", async () => {
    const firmA = await registerFirm();
    const firmB = await registerFirm();
    const ids = await catalogIds(firmA.token);
    const clientId = await createClient(firmA.token, { name: "Private Co", entityType: "INDIVIDUAL" });

    const bad = await api()
      .post(`/api/v1/clients/${clientId}/compliance-items/generate`)
      .set("Authorization", `Bearer ${firmA.token}`)
      .send({ financialYear: "2030-32", complianceTypeIds: [ids.ITR] });
    expect(bad.status).toBe(400);

    const crossTenant = await api()
      .post(`/api/v1/clients/${clientId}/compliance-items/generate`)
      .set("Authorization", `Bearer ${firmB.token}`)
      .send({ financialYear: "2030-31", complianceTypeIds: [ids.ITR] });
    expect(crossTenant.status).toBe(404);
    expect(await prisma.complianceItem.count({ where: { clientId } })).toBe(0);
  });

  it("generates every active client's suggested calendar in one go", async () => {
    const firm = await registerFirm();
    await createClient(firm.token, { name: "Individual", entityType: "INDIVIDUAL" }); // ITR 1 + advance tax 4
    await createClient(firm.token, { name: "Employer", entityType: "PARTNERSHIP", tan: "MUMA12345B" }); // + TDS 4+4
    const offboarded = await createClient(firm.token, { name: "Gone", entityType: "INDIVIDUAL", status: "OFFBOARDED" });

    const res = await api()
      .post("/api/v1/compliance-items/generate-all")
      .set("Authorization", `Bearer ${firm.token}`)
      .send({ financialYear: "2030-31" });
    expect(res.body.data).toEqual({ clients: 2, created: 5 + 13, alreadyTracked: 0, skippedPastDue: 0 });
    expect(await prisma.complianceItem.count({ where: { clientId: offboarded } })).toBe(0);
  });

  it("marks overdue filings and sends each reminder once, to the right people", async () => {
    const firm = await registerFirm();
    const staff = await addStaffMember(firm.organizationId);
    const ids = await catalogIds(firm.token);
    const clientId = await createClient(firm.token, { name: "Reminder Co", entityType: "INDIVIDUAL" });
    const add = async (dueDate: string, assignedTo?: string) => {
      const res = await api()
        .post(`/api/v1/clients/${clientId}/compliance-items`)
        .set("Authorization", `Bearer ${firm.token}`)
        .send({ complianceTypeId: ids.GSTR3B, financialYear: "2030-31", dueDate, assignedTo });
      return res.body.data.id as string;
    };
    const dueIn3 = await add("2030-07-31");
    const dueToday = await add("2030-07-28");
    const justOverdue = await add("2030-07-27");
    const longOverdue = await add("2030-07-01");
    const assignedToStaff = await add("2030-07-29", staff.memberId);

    // 20:00 UTC on 27 Jul is already 28 Jul in India — "today" must follow IST.
    const now = new Date("2030-07-27T20:00:00Z");
    const first = await sweep.sweep(now, { organizationId: firm.organizationId });
    expect(first.markedOverdue).toBe(2);

    const status = async (id: string) => (await prisma.complianceItem.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(dueToday)).toBe("UPCOMING"); // due today is not overdue
    expect(await status(justOverdue)).toBe("OVERDUE");
    expect(await status(longOverdue)).toBe("OVERDUE");

    const ownerNotes = await prisma.notification.findMany({ where: { userId: firm.userId, organizationId: firm.organizationId } });
    const byItem = Object.fromEntries(ownerNotes.map((n) => [n.relatedEntityId, n.title]));
    expect(byItem[dueIn3]).toBe("GSTR-3B is due in 3 days");
    expect(byItem[dueToday]).toBe("GSTR-3B is due today");
    expect(byItem[justOverdue]).toBe("GSTR-3B is overdue");
    expect(byItem[longOverdue]).toBeUndefined(); // outside the overdue-alert window
    expect(byItem[assignedToStaff]).toBeUndefined(); // assigned items go to the assignee only

    const staffNotes = await prisma.notification.findMany({ where: { userId: staff.userId } });
    expect(staffNotes.map((n) => [n.relatedEntityId, n.title])).toEqual([[assignedToStaff, "GSTR-3B is due tomorrow"]]);
    expect(staffNotes[0].body).toBe("Reminder Co · FY 2030-31 · due 29 Jul 2030");

    const again = await sweep.sweep(now, { organizationId: firm.organizationId });
    expect(again).toEqual({ markedOverdue: 0, notificationsCreated: 0 });
  });

  it("notifies a task's assignee when assigned and when it's due", async () => {
    const firm = await registerFirm();
    const staff = await addStaffMember(firm.organizationId);
    const created = await api()
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${firm.token}`)
      .send({ title: "Reconcile GSTR-2B", dueDate: "2030-07-29", assignedTo: staff.memberId });
    expect(created.status).toBe(201);

    await sweep.sweep(new Date("2030-07-28T06:00:00Z"), { organizationId: firm.organizationId });
    const titles = (await prisma.notification.findMany({ where: { userId: staff.userId }, orderBy: { createdAt: "asc" } })).map((n) => n.title);
    expect(titles).toEqual(["New task: Reconcile GSTR-2B", "Task is due tomorrow: Reconcile GSTR-2B"]);

    // Assigning a task to yourself doesn't notify you.
    const self = await api().get("/api/v1/organizations/current/members").set("Authorization", `Bearer ${firm.token}`);
    const ownerMemberId = self.body.data.find((m: { user: { id: string } }) => m.user.id === firm.userId).id;
    await api().patch(`/api/v1/tasks/${created.body.data.id}/assign`).set("Authorization", `Bearer ${firm.token}`).send({ assignedTo: ownerMemberId });
    expect(await prisma.notification.count({ where: { userId: firm.userId, type: "TASK_ASSIGNED" } })).toBe(0);
  });

  it("lets members read and dismiss only their own notifications", async () => {
    const firm = await registerFirm();
    const staff = await addStaffMember(firm.organizationId);
    await prisma.notification.createMany({
      data: [
        { organizationId: firm.organizationId, userId: staff.userId, type: "TEST", title: "One", body: "", channel: "in_app" },
        { organizationId: firm.organizationId, userId: staff.userId, type: "TEST", title: "Two", body: "", channel: "in_app" },
        { organizationId: firm.organizationId, userId: firm.userId, type: "TEST", title: "Owner's", body: "", channel: "in_app" },
      ],
    });
    const as = (token: string) => ({
      get: (path: string) => api().get(path).set("Authorization", `Bearer ${token}`),
      post: (path: string) => api().post(path).set("Authorization", `Bearer ${token}`),
    });

    const list = await as(staff.token).get("/api/v1/notifications");
    expect(list.body.data.map((n: { title: string }) => n.title).sort()).toEqual(["One", "Two"]);
    expect((await as(staff.token).get("/api/v1/notifications/unread-count")).body.data.count).toBe(2);

    const ownersId = (await prisma.notification.findFirstOrThrow({ where: { userId: firm.userId, title: "Owner's" } })).id;
    expect((await as(staff.token).post(`/api/v1/notifications/${ownersId}/read`)).status).toBe(404);

    await as(staff.token).post(`/api/v1/notifications/${list.body.data[0].id}/read`).expect(200);
    expect((await as(staff.token).get("/api/v1/notifications/unread-count")).body.data.count).toBe(1);
    expect((await as(staff.token).post("/api/v1/notifications/read-all")).body.data.updated).toBe(1);
    expect((await as(firm.token).get("/api/v1/notifications/unread-count")).body.data.count).toBe(1);
  });

  it("does not report a filing as overdue on its own due date", async () => {
    const firm = await registerFirm();
    const ids = await catalogIds(firm.token);
    const clientId = await createClient(firm.token, { name: "Due Today Co", entityType: "INDIVIDUAL" });
    await api()
      .post(`/api/v1/clients/${clientId}/compliance-items`)
      .set("Authorization", `Bearer ${firm.token}`)
      .send({ complianceTypeId: ids.ITR, financialYear: "2030-31", dueDate: startOfTodayIst().toISOString().slice(0, 10) });

    const res = await api().get("/api/v1/reports/summary").set("Authorization", `Bearer ${firm.token}`);
    expect(res.body.data.compliance).toMatchObject({ overdueCount: 0, dueNext30DaysCount: 1 });
  });
});
