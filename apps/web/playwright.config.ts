import { defineConfig } from "@playwright/test";

const baseURL = process.env.WEB_E2E_BASE_URL;
if (!baseURL) {
  throw new Error(
    "WEB_E2E_BASE_URL is required. Run pnpm e2e, not Playwright directly.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
});
