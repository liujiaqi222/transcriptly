import * as Sentry from "@sentry/nextjs";

/**
 * Server-side Sentry bootstrap (Node + Edge runtimes).
 * Activated only when NEXT_PUBLIC_SENTRY_DSN is set, so local dev
 * and CI runs without Sentry stay silent.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Free tier: keep trace volume low; errors are not sampled.
    tracesSampleRate: 0.1,
    // Transcript URLs can contain video ids — treat them as PII.
    sendDefaultPii: false,
  });
}

/** Capture request and nested Server Component errors reported by Next.js. */
export const onRequestError = Sentry.captureRequestError;
