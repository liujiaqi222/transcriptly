/**
 * The extension's single Sentry client — import only from extension-owned
 * contexts (background worker, popup, manager). Content scripts forward
 * serialized errors via the SENTRY_REPORT message instead; see
 * `shared/sentry.ts` for why.
 *
 * The SDK is bundled (no CDN, so MV3 CSP is a non-issue).
 *
 * Privacy: `sendDefaultPii` stays off and URLs are scrubbed to path-only in
 * `beforeSend` (see `shared/sentry.ts`).
 */
import * as Sentry from "@sentry/browser";
import type { SentryReportMessage } from "./messages";
import { deserializeError, scrubEventUrls } from "./sentry";

let initialized = false;

/**
 * Initialize Sentry in an extension-owned context. No-op when no DSN is
 * configured, so dev and CI builds without `.env` stay silent.
 */
export function initExtensionSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  initialized = true;

  Sentry.init({
    dsn,
    // Keeps extension events separate from the web app's in the same
    // Sentry project.
    environment: "extension",
    sendDefaultPii: false,
    // Errors are the point of this integration; skip performance
    // entirely so the free-tier quota is not spent on traces.
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEventUrls(event),
  });
}

/**
 * Report an error from the background worker or an extension page.
 * `flush` is fire-and-forget so a dying MV3 worker never blocks its own
 * shutdown; Sentry's send-on-capture delivers events immediately in the
 * common case, flush only guards the tail.
 */
export function reportExtensionError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("extension", context);
    }
    Sentry.captureException(error);
  });
  void Sentry.flush(5000).catch(() => undefined);
}

/**
 * Handle a SENTRY_REPORT message forwarded from a content script.
 * Never throws: monitoring must not break the message router.
 */
export async function handleSentryReport(
  message: SentryReportMessage,
): Promise<{ ok: true }> {
  reportExtensionError(deserializeError(message.error), message.context);
  return { ok: true };
}
