import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { PasswordService } from "../src/auth/password.service";

/**
 * Regression tests for the findings in docs/security-review.md. Each test proves the
 * described attack no longer works, not just that the code "looks" fixed.
 */
describe("Security hardening (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerFirm(overrides: Partial<{ email: string; password: string }> = {}) {
    const email = overrides.email ?? uniqueEmail("owner");
    const password = overrides.password ?? "a-strong-password-123";
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("x-client-platform", "desktop") // so the response body carries the raw refresh token
      .send({
        email,
        password,
        fullName: "Owner",
        organizationName: "Firm " + Date.now() + Math.random(),
        organizationSlug: "firm-" + Date.now() + Math.floor(Math.random() * 1e8),
      });
    return {
      email,
      password,
      accessToken: res.body.data.accessToken as string,
      refreshToken: res.body.data.refreshToken as string,
      organizationId: res.body.data.organizationId as string,
      userId: res.body.data.user.id as string,
    };
  }

  describe("privilege escalation via role assignment (critical finding)", () => {
    it("never lists SUPER_ADMIN as an assignable role", async () => {
      const owner = await registerFirm();
      const res = await request(app.getHttpServer())
        .get("/api/v1/roles")
        .set("Authorization", `Bearer ${owner.accessToken}`);
      expect(res.body.data.some((r: { name: string }) => r.name === "SUPER_ADMIN")).toBe(false);
    });

    it("refuses to invite a member with the SUPER_ADMIN role, even by its real id", async () => {
      const owner = await registerFirm();
      const superAdminRole = await prisma.role.findFirstOrThrow({
        where: { organizationId: null, name: "SUPER_ADMIN", isSystem: true },
      });

      const invitee = uniqueEmail("invitee");
      await prisma.user.create({
        data: {
          email: invitee,
          passwordHash: await app.get(PasswordService).hash("irrelevant-password-1"),
          fullName: "Invitee",
          status: "ACTIVE",
        },
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/organizations/current/members/invite")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ email: invitee, roleId: superAdminRole.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ROLE_NOT_FOUND");
    });

    it("refuses to change a member's role to SUPER_ADMIN, closing the self-escalation path", async () => {
      const owner = await registerFirm();
      const superAdminRole = await prisma.role.findFirstOrThrow({
        where: { organizationId: null, name: "SUPER_ADMIN", isSystem: true },
      });
      const ownMembership = await prisma.organizationMember.findFirstOrThrow({
        where: { organizationId: owner.organizationId, userId: owner.userId },
      });

      // Exact exploit chain from the review: GET /roles -> GET own member id -> PATCH self.
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/current/members/${ownMembership.id}`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ roleId: superAdminRole.id });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ROLE_NOT_FOUND");

      // Confirm the role genuinely never changed.
      const stillSame = await prisma.organizationMember.findUniqueOrThrow({ where: { id: ownMembership.id } });
      expect(stillSame.roleId).not.toBe(superAdminRole.id);
    });

    it("still allows changing a member's role to a legitimate, org-assignable role", async () => {
      const owner = await registerFirm();
      const staffRole = await prisma.role.findFirstOrThrow({
        where: { organizationId: null, name: "STAFF", isSystem: true },
      });
      const ownMembership = await prisma.organizationMember.findFirstOrThrow({
        where: { organizationId: owner.organizationId, userId: owner.userId },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/current/members/${ownMembership.id}`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ roleId: staffRole.id });

      expect(res.status).toBe(200);
      expect(res.body.data.roleId).toBe(staffRole.id);
    });
  });

  describe("session revocation (high finding)", () => {
    it("logout-all stops switch-organization from minting further access tokens on that session", async () => {
      const owner = await registerFirm();

      // Give the user a second org membership so switch-organization has somewhere to go.
      const secondOrg = await prisma.organization.create({
        data: { name: "Second Org " + Date.now(), slug: "second-org-" + Date.now() + Math.random() },
      });
      const firmAdminRole = await prisma.role.findFirstOrThrow({
        where: { organizationId: null, name: "FIRM_ADMIN", isSystem: true },
      });
      await prisma.organizationMember.create({
        data: {
          organizationId: secondOrg.id,
          userId: owner.userId,
          roleId: firmAdminRole.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      // Confirm switch-organization works before revocation.
      const before = await request(app.getHttpServer())
        .post("/api/v1/auth/switch-organization")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ organizationId: secondOrg.id });
      expect(before.status).toBe(201);

      // Revoke everything ("log out all devices" after e.g. a stolen laptop).
      const logoutAll = await request(app.getHttpServer())
        .post("/api/v1/auth/logout-all")
        .set("Authorization", `Bearer ${owner.accessToken}`);
      expect(logoutAll.status).toBe(201);

      // The original access token is still cryptographically valid (short-lived JWT, not
      // expired yet) — this is exactly the exploit: does switch-organization still mint fresh
      // tokens off a revoked session?
      const after = await request(app.getHttpServer())
        .post("/api/v1/auth/switch-organization")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ organizationId: owner.organizationId });

      expect(after.status).toBe(401);
      expect(after.body.error.code).toBe("SESSION_REVOKED");
    });

    it("logout works for a user who belongs to more than one organization", async () => {
      const owner = await registerFirm();
      const secondOrg = await prisma.organization.create({
        data: { name: "Second Org " + Date.now(), slug: "second-org-" + Date.now() + Math.random() },
      });
      const firmAdminRole = await prisma.role.findFirstOrThrow({
        where: { organizationId: null, name: "FIRM_ADMIN", isSystem: true },
      });
      await prisma.organizationMember.create({
        data: {
          organizationId: secondOrg.id,
          userId: owner.userId,
          roleId: firmAdminRole.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      // Re-login: with two ACTIVE memberships, organizationId resolves to null.
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: owner.email, password: owner.password });
      expect(login.body.data.organizationId).toBeNull();

      const logout = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${login.body.data.accessToken}`);

      expect(logout.status).toBe(201);
    });
  });

  describe("refresh token rotation race (medium finding)", () => {
    it("lets exactly one of two concurrent refreshes of the same token succeed, and kills the family", async () => {
      const owner = await registerFirm();

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/auth/refresh")
          .set("x-client-platform", "desktop")
          .send({ refreshToken: owner.refreshToken }),
        request(app.getHttpServer())
          .post("/api/v1/auth/refresh")
          .set("x-client-platform", "desktop")
          .send({ refreshToken: owner.refreshToken }),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 401]);
      const failed = first.status === 401 ? first : second;
      expect(failed.body.error.code).toBe("REFRESH_TOKEN_REUSE_DETECTED");

      // The winning token is also dead now — the whole family/session was revoked.
      const succeeded = first.status === 201 ? first : second;
      const followUp = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("x-client-platform", "desktop")
        .send({ refreshToken: succeeded.body.data.refreshToken });
      expect(followUp.status).toBe(401);
    });
  });

  describe("portal-session credential redemption race (medium finding)", () => {
    async function setupCredential(accessToken: string) {
      const gst = await prisma.portal.findUniqueOrThrow({ where: { code: "GST" } });
      const clientRes = await request(app.getHttpServer())
        .post("/api/v1/clients")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Race Test Client", entityType: "PRIVATE_LIMITED" });
      const clientId = clientRes.body.data.id as string;

      const accountRes = await request(app.getHttpServer())
        .post(`/api/v1/clients/${clientId}/portal-accounts`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ portalId: gst.id, identifier: "27RACE1234F1Z5" });
      const portalAccountId = accountRes.body.data.id as string;

      await request(app.getHttpServer())
        .post(`/api/v1/portal-accounts/${portalAccountId}/credentials`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ username: "race-user", password: "race-password" });

      return { clientId, portalAccountId };
    }

    it("lets exactly one of two concurrent redemptions of the same one-time token succeed", async () => {
      const owner = await registerFirm();
      const { clientId, portalAccountId } = await setupCredential(owner.accessToken);

      const sessionRes = await request(app.getHttpServer())
        .post("/api/v1/portal-sessions")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ clientId, portalAccountId });
      const { id: sessionId, oneTimeToken } = sessionRes.body.data;

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/portal-sessions/${sessionId}/credential`)
          .set("X-Portal-Session-Token", oneTimeToken),
        request(app.getHttpServer())
          .get(`/api/v1/portal-sessions/${sessionId}/credential`)
          .set("X-Portal-Session-Token", oneTimeToken),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 401]);
      const succeeded = first.status === 200 ? first : second;
      expect(succeeded.body.data.password).toBe("race-password");

      const auditRows = await prisma.auditLog.findMany({
        where: { organizationId: owner.organizationId, action: "CREDENTIAL_USED" },
      });
      expect(auditRows).toHaveLength(1);
    });
  });

  describe("response caching of plaintext-bearing endpoints (medium finding)", () => {
    it("sends Cache-Control: no-store on the portal-session credential response", async () => {
      const owner = await registerFirm();
      const gst = await prisma.portal.findUniqueOrThrow({ where: { code: "GST" } });
      const clientRes = await request(app.getHttpServer())
        .post("/api/v1/clients")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ name: "Cache Test Client", entityType: "PRIVATE_LIMITED" });
      const accountRes = await request(app.getHttpServer())
        .post(`/api/v1/clients/${clientRes.body.data.id}/portal-accounts`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ portalId: gst.id, identifier: "27CACHE234F1Z5" });
      await request(app.getHttpServer())
        .post(`/api/v1/portal-accounts/${accountRes.body.data.id}/credentials`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ username: "cache-user", password: "cache-password" });
      const sessionRes = await request(app.getHttpServer())
        .post("/api/v1/portal-sessions")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ clientId: clientRes.body.data.id, portalAccountId: accountRes.body.data.id });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal-sessions/${sessionRes.body.data.id}/credential`)
        .set("X-Portal-Session-Token", sessionRes.body.data.oneTimeToken);

      expect(res.headers["cache-control"]).toContain("no-store");
    });

    it("sends Cache-Control: no-store on the credential reveal response", async () => {
      const owner = await registerFirm();
      const gst = await prisma.portal.findUniqueOrThrow({ where: { code: "GST" } });
      const clientRes = await request(app.getHttpServer())
        .post("/api/v1/clients")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ name: "Reveal Cache Client", entityType: "PRIVATE_LIMITED" });
      const accountRes = await request(app.getHttpServer())
        .post(`/api/v1/clients/${clientRes.body.data.id}/portal-accounts`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ portalId: gst.id, identifier: "27CACHE334F1Z5" });
      const credRes = await request(app.getHttpServer())
        .post(`/api/v1/portal-accounts/${accountRes.body.data.id}/credentials`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ username: "reveal-user", password: "reveal-password" });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/credentials/${credRes.body.data.id}/reveal`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ currentPassword: owner.password });

      expect(res.headers["cache-control"]).toContain("no-store");
    });
  });

  describe("credential reveal kill switch fails closed (low finding)", () => {
    it("disables reveal for any non-`true` stored value, not just the literal `false`", async () => {
      const owner = await registerFirm();
      const gst = await prisma.portal.findUniqueOrThrow({ where: { code: "GST" } });
      const clientRes = await request(app.getHttpServer())
        .post("/api/v1/clients")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ name: "Kill Switch Client", entityType: "PRIVATE_LIMITED" });
      const accountRes = await request(app.getHttpServer())
        .post(`/api/v1/clients/${clientRes.body.data.id}/portal-accounts`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ portalId: gst.id, identifier: "27KILL1234F1Z5" });
      const credRes = await request(app.getHttpServer())
        .post(`/api/v1/portal-accounts/${accountRes.body.data.id}/credentials`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ username: "kill-user", password: "kill-password" });

      // A malformed/ambiguous stored value — not the literal boolean `false`.
      await prisma.setting.create({
        data: {
          organizationId: owner.organizationId,
          key: "credentials.revealEnabled",
          value: "false", // string, not boolean — the old `=== false` check missed this
          updatedBy: owner.userId,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/credentials/${credRes.body.data.id}/reveal`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ currentPassword: owner.password });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("CREDENTIAL_REVEAL_DISABLED");
    });
  });

  describe("query parameter validation (low finding)", () => {
    it("rejects an invalid status filter with 400, not a 500", async () => {
      const owner = await registerFirm();
      const res = await request(app.getHttpServer())
        .get("/api/v1/clients?status=NOT_A_REAL_STATUS")
        .set("Authorization", `Bearer ${owner.accessToken}`);
      expect(res.status).toBe(400);
    });

    it("rejects a non-numeric limit with 400, not a 500", async () => {
      const owner = await registerFirm();
      const res = await request(app.getHttpServer())
        .get("/api/v1/clients?limit=not-a-number")
        .set("Authorization", `Bearer ${owner.accessToken}`);
      expect(res.status).toBe(400);
    });

    it("ignores a cursor id belonging to another organization rather than erroring", async () => {
      const orgA = await registerFirm();
      const orgB = await registerFirm();
      const foreignClient = await request(app.getHttpServer())
        .post("/api/v1/clients")
        .set("Authorization", `Bearer ${orgB.accessToken}`)
        .send({ name: "Org B Client", entityType: "INDIVIDUAL" });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/clients?cursor=${foreignClient.body.data.id}`)
        .set("Authorization", `Bearer ${orgA.accessToken}`);

      expect(res.status).toBe(200);
    });
  });
});
