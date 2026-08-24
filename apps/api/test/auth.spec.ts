import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { PasswordService } from "../src/auth/password.service";

describe("Auth (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const registerPayload = () => ({
    email: uniqueEmail("owner"),
    password: "a-strong-password-123",
    fullName: "Firm Owner",
    organizationName: "Test Firm " + Date.now(),
    organizationSlug: "test-firm-" + Date.now() + Math.floor(Math.random() * 1e6),
  });

  it("registers a new firm and returns tokens", async () => {
    const payload = registerPayload();
    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.organizationId).toEqual(expect.any(String));
    // Web client (no x-client-platform header) must never receive the refresh token in the body.
    expect(res.body.data.refreshToken).toBeUndefined();
    // The refresh token instead comes back as an httpOnly cookie.
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toMatch(/refresh_token=.+HttpOnly/i);
  });

  it("returns the raw refresh token to a desktop client", async () => {
    const payload = registerPayload();
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("x-client-platform", "desktop")
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
  });

  it("rejects registration with a duplicate email", async () => {
    const payload = registerPayload();
    await request(app.getHttpServer()).post("/api/v1/auth/register").send(payload).expect(201);

    const res = await request(app.getHttpServer()).post("/api/v1/auth/register").send({
      ...payload,
      organizationSlug: payload.organizationSlug + "-2",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
  });

  it("rejects login with the wrong password without leaking whether the account exists", async () => {
    const payload = registerPayload();
    await request(app.getHttpServer()).post("/api/v1/auth/register").send(payload).expect(201);

    const wrongPassword = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: payload.email, password: "wrong-password-entirely" });
    const noSuchAccount = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: uniqueEmail("nobody"), password: "wrong-password-entirely" });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchAccount.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(noSuchAccount.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("logs in successfully with correct credentials", async () => {
    const payload = registerPayload();
    await request(app.getHttpServer()).post("/api/v1/auth/register").send(payload).expect(201);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: payload.email, password: payload.password });

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it("rejects API access without a bearer token", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/organizations/current");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  describe("refresh token rotation & reuse detection", () => {
    it("rotates the refresh token and rejects reuse of the old one", async () => {
      const payload = registerPayload();
      const registerRes = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .set("x-client-platform", "desktop")
        .send(payload);
      const firstRefreshToken = registerRes.body.data.refreshToken as string;

      const rotated = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("x-client-platform", "desktop")
        .send({ refreshToken: firstRefreshToken });
      expect(rotated.status).toBe(201);
      const secondRefreshToken = rotated.body.data.refreshToken as string;
      expect(secondRefreshToken).not.toEqual(firstRefreshToken);

      // Reusing the now-rotated first token must fail and must revoke the whole family.
      const reused = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("x-client-platform", "desktop")
        .send({ refreshToken: firstRefreshToken });
      expect(reused.status).toBe(401);
      expect(reused.body.error.code).toBe("REFRESH_TOKEN_REUSE_DETECTED");

      // The legitimate rotated token is now also dead, because reuse revoked the session.
      const secondAttempt = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("x-client-platform", "desktop")
        .send({ refreshToken: secondRefreshToken });
      expect(secondAttempt.status).toBe(401);
    });
  });

  describe("tenant isolation", () => {
    it("never returns another organization's members, even to an authenticated member of a different org", async () => {
      const orgAOwner = registerPayload();
      const orgBOwner = registerPayload();

      const orgARes = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send(orgAOwner);
      const orgBRes = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send(orgBOwner);

      const orgAToken = orgARes.body.data.accessToken as string;
      const orgBId = orgBRes.body.data.organizationId as string;

      // Org A's own token can list its own members.
      const ownMembers = await request(app.getHttpServer())
        .get("/api/v1/organizations/current/members")
        .set("Authorization", `Bearer ${orgAToken}`);
      expect(ownMembers.status).toBe(200);
      expect(ownMembers.body.data).toHaveLength(1);
      expect(ownMembers.body.data[0].organizationId).not.toBe(orgBId);

      // GET /organizations/current is always scoped to the caller's own token — there is no
      // endpoint that accepts an arbitrary organizationId, so cross-tenant access is
      // structurally impossible here rather than merely filtered (docs/security-design.md §3).
      const current = await request(app.getHttpServer())
        .get("/api/v1/organizations/current")
        .set("Authorization", `Bearer ${orgAToken}`);
      expect(current.body.data.id).not.toBe(orgBId);
    });
  });

  describe("RBAC", () => {
    it("blocks a STAFF-role member from an employees.manage-protected endpoint", async () => {
      const owner = registerPayload();
      const ownerRes = await request(app.getHttpServer()).post("/api/v1/auth/register").send(owner);
      const ownerToken = ownerRes.body.data.accessToken as string;
      const organizationId = ownerRes.body.data.organizationId as string;

      // Create a second user directly (not via the throttled /auth/register endpoint — this
      // test only needs a plain account) and attach them to the org with the STAFF role, as
      // an already-invited, active staff member would be.
      const staffEmail = uniqueEmail("staff");
      const staffPassword = "a-strong-password-123";
      const passwordHash = await app.get(PasswordService).hash(staffPassword);
      const staffUser = await prisma.user.create({
        data: { email: staffEmail, passwordHash, fullName: "Staff Person", status: "ACTIVE" },
      });

      const staffRole = await prisma.role.findFirstOrThrow({
        where: { organizationId: null, name: "STAFF", isSystem: true },
      });
      await prisma.organizationMember.create({
        data: {
          organizationId,
          userId: staffUser.id,
          roleId: staffRole.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      const staffLogin = await request(app.getHttpServer()).post("/api/v1/auth/login").send({
        email: staffEmail,
        password: staffPassword,
      });
      // Sole membership, so login resolves organizationId automatically.
      const staffToken = staffLogin.body.data.accessToken as string;

      const denied = await request(app.getHttpServer())
        .get("/api/v1/organizations/current/members")
        .set("Authorization", `Bearer ${staffToken}`);
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe("FORBIDDEN");

      // Meanwhile the FIRM_ADMIN owner can.
      const allowed = await request(app.getHttpServer())
        .get("/api/v1/organizations/current/members")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(allowed.status).toBe(200);
    });
  });
});
