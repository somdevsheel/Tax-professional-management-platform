import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import jwt from "jsonwebtoken";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { JwtKeysService } from "../infra/jwt-keys/jwt-keys.service";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS_DEFAULT = 30;
const ISSUER = "tax-platform";

/**
 * Owns the full token lifecycle: RS256 access-token signing, opaque refresh-token issuance,
 * rotation-with-reuse-detection. Raw refresh tokens are never stored — only their sha256 hash
 * (docs/security-design.md §2).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtKeys: JwtKeysService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private refreshTtlDays(): number {
    return Number(this.config.get("REFRESH_TOKEN_TTL_DAYS")) || REFRESH_TOKEN_TTL_DAYS_DEFAULT;
  }

  signAccessToken(userId: string, organizationId: string | null, sessionId: string): {
    token: string;
    expiresIn: number;
  } {
    const token = jwt.sign(
      { sub: userId, orgId: organizationId, sessionId },
      this.jwtKeys.privateKey,
      { algorithm: "RS256", issuer: ISSUER, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
    return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /** Creates a new session and its first refresh-token family. Used at login/register. */
  async createSession(
    userId: string,
    organizationId: string | null,
    ip: string | null,
    userAgent: string | null,
  ): Promise<IssuedTokens> {
    const expiresAt = new Date(Date.now() + this.refreshTtlDays() * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: {
        userId,
        organizationId,
        ipAddress: ip,
        deviceInfo: userAgent ? { userAgent } : undefined,
        expiresAt,
      },
    });

    const rawRefreshToken = randomBytes(32).toString("hex");
    const familyId = randomUUID();
    await this.prisma.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: this.hashToken(rawRefreshToken),
        familyId,
        expiresAt,
      },
    });

    const { token, expiresIn } = this.signAccessToken(userId, organizationId, session.id);
    return { accessToken: token, refreshToken: rawRefreshToken, expiresIn, sessionId: session.id };
  }

  /**
   * Rotates a refresh token. If the presented token was already rotated (reused), the entire
   * token family and its session are revoked — this is the reuse-detection signal for token
   * theft (docs/security-design.md §2).
   */
  async rotateRefreshToken(rawRefreshToken: string): Promise<IssuedTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: true },
    });

    if (!existing) {
      throw AppError.unauthorized("INVALID_REFRESH_TOKEN", "Refresh token is invalid");
    }

    if (existing.revokedAt || existing.expiresAt < new Date()) {
      // Reuse of an already-rotated (or expired) token: treat as compromised, kill the family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.prisma.session.update({
        where: { id: existing.sessionId },
        data: { revokedAt: new Date() },
      });
      throw AppError.unauthorized(
        "REFRESH_TOKEN_REUSE_DETECTED",
        "This refresh token has already been used; the session has been revoked",
      );
    }

    if (existing.session.revokedAt) {
      throw AppError.unauthorized("SESSION_REVOKED", "Session has been revoked");
    }

    const newRawToken = randomBytes(32).toString("hex");
    const newToken = await this.prisma.refreshToken.create({
      data: {
        sessionId: existing.sessionId,
        tokenHash: this.hashToken(newRawToken),
        familyId: existing.familyId,
        expiresAt: existing.expiresAt,
      },
    });

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedById: newToken.id },
      }),
      this.prisma.session.update({
        where: { id: existing.sessionId },
        data: { lastSeenAt: new Date() },
      }),
    ]);

    const { token, expiresIn } = this.signAccessToken(
      existing.session.userId,
      existing.session.organizationId,
      existing.sessionId,
    );
    return {
      accessToken: token,
      refreshToken: newRawToken,
      expiresIn,
      sessionId: existing.sessionId,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async revokeAllSessionsForUser(userId: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId: { in: sessions.map((s) => s.id) }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** Re-signs an access token reflecting a fresh organizationId without minting a new session. */
  async reissueAccessTokenForOrganization(
    sessionId: string,
    organizationId: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { organizationId },
    });
    const { token, expiresIn } = this.signAccessToken(session.userId, organizationId, sessionId);
    return { accessToken: token, expiresIn };
  }
}
