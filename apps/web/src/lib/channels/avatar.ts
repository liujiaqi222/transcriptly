/**
 * Rewrites a captured YouTube avatar URL to its display size. YouTube image
 * URLs carry their size in a trailing `=sNN...` parameter (`s48-c` is the
 * tiny in-page variant); asking for `s176` returns a crisp rendering for the
 * channel pages' avatar boxes without storing anything new (#98).
 */
export function displayAvatarUrl(avatarUrl: string): string {
  return avatarUrl.replace(/=s\d+([^=]*)$/, "=s176$1");
}
