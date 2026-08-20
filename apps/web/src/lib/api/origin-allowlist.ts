/**
 * Exact-match origin allowlist for cookie-authenticated JSON APIs.
 *
 * `SameSite=Lax` stops cross-site requests from ordinary web pages, but a
 * browser extension with host permissions sends its requests *same-site*
 * with the session cookie attached. The only meaningful boundary left is
 * the `Origin` header: every allowed caller (the website itself and each
 * precisely identified extension build) must be listed exactly - never a
 * wildcard `chrome-extension://*`.
 */

/** Parse a comma-separated origin list; trims and drops empty entries. */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function isAllowedOrigin(
  origin: string | null | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) {
    return false;
  }
  return allowedOrigins.includes(origin);
}
