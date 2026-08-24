/** Identity resolved from a verified JWT. Set by JwtAuthGuard; never trust any other source. */
export interface AuthContext {
  userId: string;
  organizationId: string | null;
  sessionId: string;
}

export interface JwtAccessTokenPayload {
  sub: string;
  orgId: string | null;
  sessionId: string;
  iss: string;
  iat: number;
  exp: number;
}
