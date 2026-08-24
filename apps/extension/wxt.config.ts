import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

const extensionRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * The web origin this build talks to. Defaults to the local dev server;
 * production builds pass the exact origin via WEB_ORIGIN.
 */
const webOrigin = (process.env.WEB_ORIGIN ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

/**
 * E2E builds override the output directory (WXT_OUT_DIR) so a dedicated
 * build talking to the mock web server on its own port never clobbers the
 * regular .output build.
 */
const outDir = process.env.WXT_OUT_DIR ?? ".output";

export default defineConfig({
  outDir,
  dev: {
    server: {
      port: 3001,
      // The manifest CSP is generated from this port, so never silently
      // fall back to a random port when another dev server owns 3001.
      strictPort: true,
    },
  },
  manifest: {
    name: "Transcriptly",
    description:
      "Capture YouTube transcripts to local Markdown and your private cloud library.",
    // "tabs" is required for extension pages to read the active tab's
    // URL (watch-page / batch-source detection). WXT only adds it in dev
    // mode, which previously masked a production-only breakage.
    permissions: ["alarms", "storage", "tabs"],
    // Fixed key keeps the extension ID stable so the server can allowlist
    // the exact chrome-extension:// origin.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2oKt6WgycyPtw7+lRf8zD1SK/AYBZzgwAnZsxIjvacxrWTWLm9xLjfOgdZ3iyPRq2Eg4DiGOvHKk/Rn39gRpU1EYlvTVOp+PLkhV5z/N3l8+ptv4jetOr5sE8tFBCFRRGkLOXsVgjl+V/ia+y+hpgWZ+In5kFs+dBpr+hDOsj1klKxvAh57fGbZE03U3etiY5x7hy4eIGFM1hj2BZIH3Zxb+qUGOQcT7jevpEGdJAPRA5RlGLG5v/7w1JjjOjWAiTKUVnaePjR+iVeNv+yvOrJq3u/vOxaCHQ43eeWGZClopVUqgle2I5PAmR4pJlaeXUE8ls3XBgt4wWa9e50Tc7wIDAQAB",
    host_permissions: [`${webOrigin}/*`],
  },
  vite: () => ({
    plugins: [react()],
    define: {
      __WEB_ORIGIN__: JSON.stringify(webOrigin),
    },
    resolve: {
      alias: {
        "@": extensionRoot,
      },
    },
  }),
});
