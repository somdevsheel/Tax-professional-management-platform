import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, uniqueEmail } from "./utils/test-app";
import { NoopEmailService } from "../src/infra/email/noop-email.provider";

describe("Password reset (integration)", () => {
  let app: INestApplication;
  let emailService: NoopEmailService;

  beforeAll(async () => {
    app = await createTestApp();
    emailService = app.get(NoopEmailService);
  });

  afterAll(async () => {
    await app.close();
  });

  function registerPayload() {
    return {
      email: uniqueEmail("reset"),
      password: "the-original-password-123",
      fullName: "Reset Test User",
      organizationName: "Reset Test Firm " + Date.now(),
      organizationSlug: "reset-firm-" + Date.now() + Math.floor(Math.random() * 1e6),
    };
  }

  /** The raw token only ever exists in memory + the one email sent — captured here via a spy
   *  on the (dev-only) NoopEmailService, standing in for "read the email a real user would
   *  receive" since the token's hash-only-at-rest design means the database can't be read
   *  for it (that's the point). */
  async function requestResetAndCaptureToken(email: string): Promise<string> {
    const sendSpy = jest.spyOn(emailService, "send");
    const res = await request(app.getHttpServer()).post("/api/v1/auth/forgot-password").send({ email });
    expect(res.status).toBe(201);
    const sentText = sendSpy.mock.calls.at(-1)?.[0]?.text ?? "";
    const match = sentText.match(/token=([a-f0-9]+)/);
    if (!match) throw new Error("Reset email was not sent or did not contain a token");
    sendSpy.mockRestore();
    return match[1];
  }

  it("resets the password, revokes the existing session's refresh token, and lets the new password sign in", async () => {
    const payload = registerPayload();
    // x-client-platform: desktop is what makes the API return the raw refresh token in the
    // body at all (a web client only ever gets it as an httpOnly cookie) — needed here to
    // prove session revocation actually blocks it, not just to have a handle on it.
    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("x-client-platform", "desktop")
      .send(payload);
    const oldRefreshToken = registerRes.body.data.refreshToken as string;

    const token = await requestResetAndCaptureToken(payload.email);

    const resetRes = await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: "a-brand-new-password-456" });
    expect(resetRes.status).toBe(201);

    // The access token issued before the reset is a short-lived, stateless JWT — it stays
    // valid until its own TTL expiry regardless of session revocation, by design (it's never
    // checked against session state on every request). What "every session revoked" actually
    // means is provable here: the refresh token from that same session can no longer mint a
    // new access token.
    const refreshWithOldTokenRes = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: oldRefreshToken });
    expect(refreshWithOldTokenRes.status).toBe(401);

    // Old password must no longer work.
    const loginWithOldPasswordRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: payload.email, password: payload.password });
    expect(loginWithOldPasswordRes.status).toBe(401);

    // New password must work.
    const loginWithNewPasswordRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: payload.email, password: "a-brand-new-password-456" });
    expect(loginWithNewPasswordRes.status).toBe(201);
  });

  it("rejects reusing an already-used reset token", async () => {
    const payload = registerPayload();
    await request(app.getHttpServer()).post("/api/v1/auth/register").send(payload);
    const token = await requestResetAndCaptureToken(payload.email);

    const firstUse = await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: "first-new-password-123" });
    expect(firstUse.status).toBe(201);

    const secondUse = await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: "second-new-password-456" });
    expect(secondUse.status).toBe(401);
  });

  it("rejects a garbage token", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token: "not-a-real-token-at-all-just-junk", newPassword: "whatever-password-123" });
    expect(res.status).toBe(401);
  });

  it("responds identically whether or not the email exists, never revealing which", async () => {
    const knownEmailRes = await request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: (await registerAndGetEmail()) });
    const unknownEmailRes = await request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: uniqueEmail("never-registered") });

    expect(knownEmailRes.status).toBe(unknownEmailRes.status);
    expect(knownEmailRes.body).toEqual(unknownEmailRes.body);
  });

  async function registerAndGetEmail(): Promise<string> {
    const payload = registerPayload();
    await request(app.getHttpServer()).post("/api/v1/auth/register").send(payload);
    return payload.email;
  }
});
