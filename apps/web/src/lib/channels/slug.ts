/**
 * Derives the readable part of a channel route from its captured YouTube path.
 * Dots, underscores, and hyphens are preserved so distinct YouTube handles do
 * not collapse onto the same route.
 */
export function channelSlug(handle: string): string {
  const slug = handle
    .replace(/^\/?@/, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\//g, "-")
    .replace(/[^A-Za-z0-9._~-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "channel";
}
