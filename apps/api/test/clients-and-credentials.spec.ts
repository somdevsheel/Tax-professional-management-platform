import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";
import { PrismaService } from "../src/infra/prisma/prisma.service";

describe("Clients & Credentials (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gstPortalId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const gst = await prisma.portal.findUniqueOrThrow({ where: { code: "GST" } });
    gstPortalId = gst.id;
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
      email,
      password,
      accessToken: res.body.data.accessToken as string,
      organizationId: res.body.data.organizationId as string,
      userId: res.body.data.user.id as string,
    };
  }

  async function createClientWithPortalAndCredential(token: string) {
    const clientRes = await request(app.getHttpServer())
      .post("/api/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "ABC Pvt Ltd", entityType: "PRIVATE_LIMITED", gstin: "27ABCDE1234F1Z5" });
    const clientId = clientRes.body.data.id as string;

    const accountRes = await request(app.getHttpServer())
      .post(`/api/v1/clients/${clientId}/portal-accounts`)
      .set("Authorization", `Bearer ${token}`)
      .send({ portalId: gstPortalId, identifier: "27ABCDE1234F1Z5" });
    const portalAccountId = accountRes.body.data.id as string;

    const credRes = await request(app.getHttpServer())
      .post(`/api/v1/portal-accounts/${portalAccountId}/credentials`)
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "gst-user", password: "portal-password-123" });

    return { clientId, portalAccountId, credentialId: credRes.body.data.id as string, credRes };
  }

  describe("clients", () => {
    it("creates a client and audits CLIENT_CREATED", async () => {
      const owner = await registerFirm();
      const res = await request(app.getHttpServer())
        .post("/api/v1/clients")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ name: "ABC Pvt Ltd", entityType: "PRIVATE_LIMITED", pan: "ABCDE1234F" });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe("ABC Pvt Ltd");

      const logs = await prisma.auditLog.findMany({
        where: { organizationId: owner.organizationId, action: "CLIENT_CREATED" },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].resourceId).toBe(res.body.data.id);
    });

    it("never returns another organization's client, even by guessing a valid client id", async () => {
      const orgA = await registerFirm();
      const orgB = await registerFirm();

      const created = await request(app.getHttpServer())
        .post("/api/v1/clients")
        .set("Authorization", `Bearer ${orgA.accessToken}`)
        .send({ name: "Org A Client", entityType: "INDIVIDUAL" });
      const clientId = created.body.data.id as string;

      const crossTenantRead = await request(app.getHttpServer())
        .get(`/api/v1/clients/${clientId}`)
        .set("Authorization", `Bearer ${orgB.accessToken}`);
      expect(crossTenantRead.status).toBe(404);
      expect(crossTenantRead.body.error.code).toBe("CLIENT_NOT_FOUND");

      const crossTenantList = await request(app.getHttpServer())
        .get("/api/v1/clients")
        .set("Authorization", `Bearer ${orgB.accessToken}`);
      expect(crossTenantList.body.data.some((c: { id: string }) => c.id === clientId)).toBe(false);
    });
  });

  describe("credentials", () => {
    it("never stores or returns plaintext in the create response", async () => {
      const owner = await registerFirm();
      const { credRes } = await createClientWithPortalAndCredential(owner.accessToken);

      expect(credRes.status).toBe(201);
      expect(JSON.stringify(credRes.body)).not.toContain("portal-password-123");
      expect(credRes.body.data.payloadCiphertext).toBeUndefined();
      expect(credRes.body.data.status).toBe("ACTIVE");
    });

    it("audits CREDENTIAL_CREATED and writes a credential_access_logs row without plaintext", async () => {
      const owner = await registerFirm();
      const { credentialId } = await createClientWithPortalAndCredential(owner.accessToken);

      const auditRows = await prisma.auditLog.findMany({
        where: { organizationId: owner.organizationId, action: "CREDENTIAL_CREATED", resourceId: credentialId },
      });
      expect(auditRows).toHaveLength(1);
      expect(JSON.stringify(auditRows[0].metadata)).not.toContain("portal-password-123");

      const accessLogs = await prisma.credentialAccessLog.findMany({ where: { credentialId } });
      expect(accessLogs.some((l) => l.action === "CREATED")).toBe(true);
    });

    it("rejects reveal with the wrong step-up password, and never returns plaintext", async () => {
      const owner = await registerFirm();
      const { credentialId } = await createClientWithPortalAndCredential(owner.accessToken);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/credentials/${credentialId}/reveal`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ currentPassword: "totally-wrong-password" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("REAUTHENTICATION_FAILED");
      expect(JSON.stringify(res.body)).not.toContain("portal-password-123");
    });

    it("reveals plaintext only with the correct step-up password, and audits CREDENTIAL_REVEALED", async () => {
      const owner = await registerFirm();
      const { credentialId } = await createClientWithPortalAndCredential(owner.accessToken);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/credentials/${credentialId}/reveal`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ currentPassword: owner.password });

      expect(res.status).toBe(201);
      expect(res.body.data.password).toBe("portal-password-123");
      expect(res.body.data.username).toBe("gst-user");

      const auditRows = await prisma.auditLog.findMany({
        where: { organizationId: owner.organizationId, action: "CREDENTIAL_REVEALED", resourceId: credentialId },
      });
      expect(auditRows.filter((r) => r.result === "success")).toHaveLength(1);
    });

    it("rotates a credential to a new value and the old plaintext no longer decrypts to it", async () => {
      const owner = await registerFirm();
      const { credentialId } = await createClientWithPortalAndCredential(owner.accessToken);

      const rotateRes = await request(app.getHttpServer())
        .patch(`/api/v1/credentials/${credentialId}`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ password: "brand-new-password-456" });
      expect(rotateRes.status).toBe(200);
      expect(rotateRes.body.data.lastRotatedAt).toEqual(expect.any(String));

      const revealRes = await request(app.getHttpServer())
        .post(`/api/v1/credentials/${credentialId}/reveal`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ currentPassword: owner.password });
      expect(revealRes.body.data.password).toBe("brand-new-password-456");
      expect(revealRes.body.data.username).toBe("gst-user"); // untouched field preserved
    });

    it("never exposes another organization's credential, even by guessing a valid credential id", async () => {
      const orgA = await registerFirm();
      const orgB = await registerFirm();
      const { credentialId } = await createClientWithPortalAndCredential(orgA.accessToken);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/credentials/${credentialId}`)
        .set("Authorization", `Bearer ${orgB.accessToken}`);
      expect(res.status).toBe(404);

      // Step-up re-auth checks the caller's own password (which is correct for their own
      // account), so this proceeds to the tenant-scoped lookup, which is where it's actually
      // blocked: the credential belongs to a different organization.
      const revealAttempt = await request(app.getHttpServer())
        .post(`/api/v1/credentials/${credentialId}/reveal`)
        .set("Authorization", `Bearer ${orgB.accessToken}`)
        .send({ currentPassword: orgB.password });
      expect(revealAttempt.status).toBe(404);
      expect(revealAttempt.body.error.code).toBe("CREDENTIAL_NOT_FOUND");
    });
  });

  describe("portal sessions (credential use)", () => {
    it("issues a one-time token that can be redeemed exactly once for the transient plaintext", async () => {
      const owner = await registerFirm();
      const { clientId, portalAccountId } = await createClientWithPortalAndCredential(owner.accessToken);

      const sessionRes = await request(app.getHttpServer())
        .post("/api/v1/portal-sessions")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ clientId, portalAccountId });
      expect(sessionRes.status).toBe(201);
      const { id: sessionId, oneTimeToken } = sessionRes.body.data;

      const redeemed = await request(app.getHttpServer())
        .get(`/api/v1/portal-sessions/${sessionId}/credential`)
        .set("X-Portal-Session-Token", oneTimeToken);
      expect(redeemed.status).toBe(200);
      expect(redeemed.body.data.password).toBe("portal-password-123");

      // Second redemption of the same token must fail — single use.
      const secondAttempt = await request(app.getHttpServer())
        .get(`/api/v1/portal-sessions/${sessionId}/credential`)
        .set("X-Portal-Session-Token", oneTimeToken);
      expect(secondAttempt.status).toBe(401);
      expect(secondAttempt.body.error.code).toBe("TOKEN_ALREADY_USED");

      const auditRows = await prisma.auditLog.findMany({
        where: { organizationId: owner.organizationId, action: "CREDENTIAL_USED" },
      });
      expect(auditRows).toHaveLength(1);
    });

    it("rejects an invalid session token outright", async () => {
      const owner = await registerFirm();
      const { clientId, portalAccountId } = await createClientWithPortalAndCredential(owner.accessToken);

      const sessionRes = await request(app.getHttpServer())
        .post("/api/v1/portal-sessions")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ clientId, portalAccountId });
      const { id: sessionId } = sessionRes.body.data;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/portal-sessions/${sessionId}/credential`)
        .set("X-Portal-Session-Token", "not-the-right-token");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_SESSION_TOKEN");
    });
  });
});
