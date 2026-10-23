import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";
import { PrismaService } from "../src/infra/prisma/prisma.service";

// Mirrors LOGIN_LOCKOUT_MAX_FAILURES / LOGIN_LOCKOUT_WINDOW_MINUTES in auth.service.ts.
const MAX_FAILURES = 10;
const WINDOW_MINUTES = 15;

describe("Account lockout (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerUser() {
    const password = "a-correct-password-123";
    const email = uniqueEmail("lockout");
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email,
        password,
        fullName: "Lockout Test User",
        organizationName: "Lockout Firm " + Date.now(),
        organizationSlug: "lockout-firm-" + Date.now() + Math.floor(Math.random() * 1e6),
      });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { email, password, userId: user.id };
  }

  /** Seeds failure rows directly rather than via N real requests — the per-IP @Throttle on
   *  /auth/login (10/min) would otherwise trip before the per-account threshold could be
   *  reached, and that's a different mechanism from the one under test here. */
  async function seedFailures(userId: string, count: number, minutesAgo = 0) {
    const createdAt = new Date(Date.now() - minutesAgo * 60_000);
    await prisma.auditLog.createMany({
      data: Array.from({ length: count }, () => ({
        actorUserId: userId,
        action: "LOGIN_FAILED",
        resourceType: "user",
        resourceId: userId,
        result: "failure",
        createdAt,
      })),
    });
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
  }

  it("still allows the correct password just below the threshold", async () => {
    const { email, password, userId } = await registerUser();
    await seedFailures(userId, MAX_FAILURES - 1);

    const res = await login(email, password);
    expect(res.status).toBe(201);
  });

  it("rejects even the correct password once the threshold is reached, with the same response as a wrong password", async () => {
    const { email, password, userId } = await registerUser();
    await seedFailures(userId, MAX_FAILURES);

    const locked = await login(email, password);
    const wrong = await login(email, "definitely-the-wrong-password");
    expect(locked.status).toBe(401);
    expect(locked.body.error.code).toBe(wrong.body.error.code);
    expect(locked.body.error.message).toBe(wrong.body.error.message);

    const lockedRow = await prisma.auditLog.findFirst({
      where: { actorUserId: userId, action: "LOGIN_FAILED", metadata: { path: ["reason"], equals: "account_locked" } },
    });
    expect(lockedRow).not.toBeNull();
  });

  it("ignores failures older than the lockout window", async () => {
    const { email, password, userId } = await registerUser();
    await seedFailures(userId, MAX_FAILURES, WINDOW_MINUTES + 1);

    const res = await login(email, password);
    expect(res.status).toBe(201);
  });
});
