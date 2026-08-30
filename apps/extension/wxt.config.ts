import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

const extensionRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * The web origin this build talks to. Defaults to the local dev server;
 * production builds default to the deployed Transcriptly site. WEB_ORIGIN
 * remains an explicit override for E2E, previews, or alternate deployments.
 */
const defaultWebOrigin =
  process.env.NODE_ENV === "production"
    ? "https://transcript.libmap.cn"
    : "http://localhost:3000";
const webOrigin = (process.env.WEB_ORIGIN ?? defaultWebOrigin).replace(
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
  // Toolbar and store icons live in `public/icon-<size>.png`; WXT
  // discovers them automatically and writes manifest.icons. Regenerate
  // them from `assets/logo.svg` with `pnpm icons`.
  manifest: {
    name: "Transcriptly",
    description:
      "Capture YouTube transcripts to local Markdown or contribute them to the public archive.",
    // "tabs" is required for extension pages to read the active tab's
    // URL (watch-page / batch-source detection). WXT only adds it in dev
    // mode, which previously masked a production-only breakage.
    permissions: ["alarms", "storage", "tabs"],
    // Fixed key keeps the extension ID stable so the server can allowlist
    // the exact chrome-extension:// origin.
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvxCB4JX74qO7PB0kDZsCs4bgFe5VP7WwEqr799IApjGYaa2JrUMd8iWOQBq9KQ4+8UDMFTNf2IVopUv02d7v6ehG8YM5bw/eySE0Gya5nbyRftTYZc+iUXuem0KWYjOSuX7ft+d58ffcH0FnfWRIf86Pex4LGJbbCBl7AVSrxdK9/IfPM+k5ps/P5SLagG4ajBUx6gy7TqmlmuuogFNkm+OoIkrBKaVsiI/Fkl6jqc3ZO8ppQf7hZ/9RIp0g66/6IrkFj3hRDkShbeSjRsYLe8vZ1sNBejXv99OmyRdlCH5ZGVPNKRqSO1tDOx6DTn737rgeNefm2CXOsbQSIkZstwIDAQAB",
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
