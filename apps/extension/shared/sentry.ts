/**
 * Sentry helpers that are safe to import from content scripts — no SDK
 * import, so the bundle injected into every YouTube page stays small.
 *
 * The SDK-dependent half lives in `shared/sentry-client.ts`, used only by
 * extension-owned contexts (background worker, popup, manager).
 *
 * Privacy: URLs are scrubbed to path-only. Pathnames are kept deliberately:
 * they carry the video/channel identifiers the project treats as reportable
 * (AGENTS.md / live-fixtures workflow), while query strings (`?t=90`,
 * `?si=...`) are dropped as pure user state.
 */

/** Strip a URL down to its pathname, keeping video/channel ids. */
export function scrubUrl(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Scrub every URL in a Sentry event (request url, breadcrumbs) to
 * path-only. Exported for tests.
 */
export function scrubEventUrls<Event extends object>(event: Event): Event {
  const record = event as unknown as {
    breadcrumbs?: { data?: Record<string, unknown> }[];
    request?: { url?: string };
  };
  if (typeof record.request?.url === "string") {
    record.request.url = scrubUrl(record.request.url);
  }
  for (const crumb of record.breadcrumbs ?? []) {
    const data = crumb.data;
    if (!data) continue;
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && value.startsWith("http")) {
        data[key] = scrubUrl(value);
      }
    }
  }
  return event;
}

/**
 * Serialize an Error for the content-script → background pipe.
 * `browser.runtime.sendMessage` uses structured clone, which drops
 * `Error` prototypes, so we ship the plain fields instead.
 */
export function serializeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { name: "NonError", message: String(error) };
}

/** Rebuild a captureable error from the serialized form. */
export function deserializeError(payload: {
  name: string;
  message: string;
  stack?: string;
}): Error {
  const error = new Error(payload.message);
  error.name = payload.name;
  error.stack = payload.stack;
  return error;
}

/**
 * Whether an ErrorEvent / PromiseRejection seen inside a content script
 * belongs to extension code. Content scripts share the page's `window`,
 * so YouTube's own errors reach our listeners too — only forward stack
 * frames pointing at the extension's own URL (chrome-extension://… or
 * moz-extension://…).
 */
export function isExtensionOrigin(
  candidate: string | undefined,
  extensionUrl: string,
): boolean {
  return typeof candidate === "string" && candidate.includes(extensionUrl);
}
