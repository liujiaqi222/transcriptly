/**
 * The post-sign-in destination from a `?callbackURL=` parameter. Only
 * same-site relative paths are honored: anything absolute or
 * protocol-relative (`//evil.example`) falls back to the landing page, so the
 * sign-in flow can never be turned into an open redirect.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/";
  }
  return raw;
}
