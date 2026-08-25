/** Display-only decode, never a trust boundary — see apps/web/lib/jwt.ts for the same helper
 *  and rationale (docs/security-design.md §4). */
export function decodeAccessTokenOrgId(token: string): string | null {
  try {
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.orgId === "string" ? payload.orgId : null;
  } catch {
    return null;
  }
}
