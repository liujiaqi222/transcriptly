import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Builds a dedicated extension for the cloud-save e2e tests. It talks to
 * http://localhost:3999 - the mock web server started inside the spec - so
 * the tests never depend on (or fight with) the real web dev server that
 * usually owns port 3000.
 */
export default function globalSetup(): void {
  execSync("pnpm wxt build", {
    cwd: path.resolve(import.meta.dirname, ".."),
    stdio: "inherit",
    env: {
      ...process.env,
      WEB_ORIGIN: "http://localhost:3999",
      WXT_OUT_DIR: ".output-e2e",
    },
  });
}
