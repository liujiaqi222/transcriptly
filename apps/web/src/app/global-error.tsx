"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { LogoMark } from "@/components/logo-mark";

/**
 * Root-level error boundary: fires when the root layout itself fails, so
 * it renders its own <html>/<body> and inlines the brand styles (globals
 * may not have loaded). Styled to match the product: warm-white surface,
 * ink text, serif display heading, action-blue recovery button.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <style
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static, no user input
          dangerouslySetInnerHTML={{ __html: STYLE }}
        />
      </head>
      <body>
        <main className="error-page">
          <LogoMark size={32} className="error-mark" />
          <h1>Something went wrong</h1>
          <p>
            The page hit an unexpected error. Your transcripts and account are
            safe.
          </p>
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

const STYLE = `
  .error-page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    background: #fffdf8;
    color: #202124;
    font-family: Inter, ui-sans-serif, -apple-system, "Segoe UI", Roboto,
      sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .error-mark {
    color: #202124;
    margin-bottom: 4px;
  }
  .error-page h1 {
    margin: 0;
    font-family: "Fraunces", Georgia, "Times New Roman", serif;
    font-weight: 600;
    font-size: 32px;
    line-height: 1.2;
    letter-spacing: -0.03em;
  }
  .error-page p {
    margin: 0;
    max-width: 420px;
    color: #64748b;
    font-size: 15px;
    line-height: 1.5;
  }
  .error-page button {
    margin-top: 8px;
    padding: 10px 20px;
    border: 1px solid #b9ddfa;
    border-radius: 6px;
    background: #1b90ed;
    color: #fff;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .error-page button:hover {
    background: #147ac9;
  }
  .error-page button:focus-visible {
    outline: 3px solid rgba(27, 144, 237, 0.32);
    outline-offset: 2px;
  }
`;
