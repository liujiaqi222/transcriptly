import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";

const extensionPath = path.resolve(".output/chrome-mv3");
const manifestPath = path.join(extensionPath, "manifest.json");

function extensionIdFromKey(base64Key: string): string {
  const publicKey = Buffer.from(base64Key, "base64");
  const hex = createHash("sha256").update(publicKey).digest("hex");
  let id = "";
  for (let i = 0; i < 32; i++) {
    const nibble = Number.parseInt(hex.charAt(i), 16);
    id += String.fromCharCode("a".charCodeAt(0) + nibble);
  }
  return id;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

test("manifest exposes only popup + content script (no background / options)", () => {
  expect(manifest.action?.default_popup).toBeTruthy();
  expect(manifest.background).toBeUndefined();
  expect(manifest.options_ui).toBeUndefined();
  expect(manifest.options_page).toBeUndefined();
  expect(manifest.content_scripts?.length).toBeGreaterThan(0);
});

test("extension loads and popup renders via launchPersistentContext + --load-extension", async () => {
  const extensionId = extensionIdFromKey(manifest.key);
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/${manifest.action.default_popup}`,
  );
  await expect(
    page.getByRole("heading", { name: "Transcriptly" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Open a YouTube video and try again/),
  ).toBeVisible();

  await context.close();
});
