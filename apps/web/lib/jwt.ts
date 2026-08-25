/**
 * Decodes (never verifies) the access token's payload purely so the UI knows which
 * organization is currently active. This is not a security boundary — every real
 * authorization decision happens server-side against the signed token
 * (docs/security-design.md §4); this is display-only convenience.
 */
export function decodeAccessTokenOrgId(token: string): string | null {
  try {
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.orgId === "string" ? payload.orgId : null;
  } catch {
    return null;
  }
}
