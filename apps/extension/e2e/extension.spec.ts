import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
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
  // Without "tabs", extension pages cannot read tab URLs at all in a
  // production build (WXT only adds it in dev mode, which masks the gap)
  // and watch-page detection fails outside `wxt dev`.
  expect(manifest.permissions).toContain("tabs");
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

test("extension pages can read tab urls from the production build", async () => {
  // Serve a plain http page so the tab under test has a non-extension
  // origin; its URL must be visible to the popup page, which drives all
  // watch-page / batch-source detection.
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<h1>tab under test</h1>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("test server did not bind to a port");
  }
  const tabUrl = `http://127.0.0.1:${address.port}/`;

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
  await page.goto(tabUrl);
  const popup = await context.newPage();
  await popup.goto(
    `chrome-extension://${extensionId}/${manifest.action.default_popup}`,
  );
  const urls = await popup.evaluate(async () => {
    const chrome = (
      globalThis as unknown as {
        chrome: {
          tabs: {
            query(queryInfo: {
              currentWindow?: boolean;
            }): Promise<Array<{ url?: string }>>;
          };
        };
      }
    ).chrome;
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs.map((tab) => tab.url);
  });
  expect(urls).toContain(tabUrl);

  await context.close();
  server.close();
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
  // Listen for the manager tab before triggering it: on loaded CI runners
  // the new background tab can take longer than the default poll timeout
  // to surface in context.pages(), so wait for the creation event instead.
  const managerOpened = context.waitForEvent("page", { timeout: 30_000 });
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
  const manager = await managerOpened;
  // The coordinator creates the tab at manager.html first, then deep-links
  // it to ?task=…, so wait for the final committed URL.
  await manager.waitForURL(managerUrl, { timeout: 30_000 });
  await expect(
    manager.getByRole("heading", { name: "Transcriptly batch" }),
  ).toBeVisible();

  await context.close();
});
