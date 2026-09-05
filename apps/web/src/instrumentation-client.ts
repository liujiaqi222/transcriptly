import * as Sentry from "@sentry/nextjs";

/**
 * Client-side Sentry bootstrap. Inlined at build time via the
 * NEXT_PUBLIC_ prefix; absent DSN means no-op (local dev / CI).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

/** Continue active traces across App Router client-side navigations. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
