import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";

const extensionPath = path.resolve(".output-e2e/chrome-mv3");
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

test("manifest exposes popup, content script, background, and the exact cloud host permission", () => {
  expect(manifest.action?.default_popup).toBeTruthy();
  expect(manifest.background?.service_worker).toBeTruthy();
  expect(manifest.options_ui).toBeUndefined();
  expect(manifest.options_page).toBeUndefined();
  expect(manifest.content_scripts?.length).toBeGreaterThan(0);
  // The dedicated E2E build talks only to its mock web server.
  expect(manifest.host_permissions).toEqual(["http://localhost:3999/*"]);
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

test("background opens the private manager page for an extension message", async () => {
  const extensionId = extensionIdFromKey(manifest.key);
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const popup = await context.newPage();
  await popup.goto(
    `chrome-extension://${extensionId}/${manifest.action.default_popup}`,
  );
  const result = await popup.evaluate(async () => {
    const runtime = (
      globalThis as unknown as {
        chrome: {
          runtime: {
            sendMessage(message: unknown): Promise<unknown>;
          };
        };
      }
    ).chrome.runtime;
    return runtime.sendMessage({
      type: "transcriptly:batch-open-manager",
      taskId: "task-e2e",
    });
  });

  expect(result).toEqual({ ok: true });
  const managerUrl = `chrome-extension://${extensionId}/manager.html?task=task-e2e`;
  await expect
    .poll(() => context.pages().some((page) => page.url() === managerUrl))
    .toBe(true);
  const manager = context.pages().find((page) => page.url() === managerUrl);
  if (!manager) throw new Error("manager page did not open");
  await expect(
    manager.getByRole("heading", { name: "Transcriptly batch" }),
  ).toBeVisible();

  await context.close();
});
