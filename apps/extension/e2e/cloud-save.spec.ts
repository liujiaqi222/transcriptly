import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { type BrowserContext, chromium, expect, test } from "@playwright/test";

const extensionPath = path.resolve(".output-e2e/chrome-mv3");
const manifestPath = path.join(extensionPath, "manifest.json");

/** The port the e2e build's WEB_ORIGIN points at (see global-setup.ts). */
const MOCK_WEB_PORT = 3999;

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
const extensionId = extensionIdFromKey(manifest.key);
const extensionOrigin = `chrome-extension://${extensionId}`;
const popupUrl = `chrome-extension://${extensionId}/${manifest.action.default_popup}`;

interface ChromeRuntime {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
  };
}

/**
 * Minimal stand-in for the web app's auth + capture APIs. The dedicated e2e
 * build (see global-setup.ts) talks to http://localhost:3999, which this
 * mock server owns for the duration of each test.
 */
interface RecordedCapture {
  capture: { source: { videoId: string }; capturedAt: string };
}

function startMockWeb(options: { signedIn: boolean }) {
  const uploads: RecordedCapture[] = [];
  const server = http.createServer((request, response) => {
    const cors = {
      "Access-Control-Allow-Origin": extensionOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      response.end();
      return;
    }

    if (request.method === "GET" && request.url === "/api/auth/get-session") {
      response.writeHead(200, cors);
      response.end(
        JSON.stringify(
          options.signedIn ? { user: { email: "user@example.test" } } : null,
        ),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/api/v1/captures") {
      let body = "";
      request.on("data", (chunk: string) => {
        body += chunk;
      });
      request.on("end", () => {
        const capture = JSON.parse(body);
        uploads.push({
          capture: {
            source: { videoId: capture.source.videoId },
            capturedAt: capture.capturedAt,
          },
        });
        response.writeHead(200, cors);
        response.end(
          JSON.stringify({
            success: true,
            data: {
              libraryItemId: "lib-item-e2e",
              videoId: capture.source.videoId,
              outcome: "created",
              currentCapturedAt: capture.capturedAt,
              processedAt: new Date().toISOString(),
            },
          }),
        );
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/sign-out") {
      response.writeHead(200, cors);
      response.end("{}");
      return;
    }

    response.writeHead(404, cors);
    response.end("{}");
  });

  return {
    uploads,
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(MOCK_WEB_PORT, () => resolve());
      });
    },
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function launchExtension() {
  return chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
}

async function openPopup(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(popupUrl);
  await expect(
    page.getByRole("heading", { name: "Transcriptly" }),
  ).toBeVisible();
  return page;
}

const capturePayload = {
  source: {
    videoId: "e2etestvid1",
    url: "https://www.youtube.com/watch?v=e2etestvid1",
    title: "E2E Cloud Save",
    channelName: "Ship It Weekly",
    channelUrl: "https://www.youtube.com/@shipitweekly",
    description: "An episode.",
  },
  capturedAt: "2026-08-21T10:30:00.000Z",
  segments: [{ start: 0, text: "Hello from the e2e test." }],
};

test("cloud upload completes after the popup closes and leaves only a receipt", async () => {
  const web = startMockWeb({ signedIn: true });
  await web.start();
  const context = await launchExtension();
  try {
    // The popup resolves the session through the background worker and
    // the real fetch + CORS path against the mock web app.
    const popup = await openPopup(context);
    await expect(popup.getByText("user@example.test")).toBeVisible();

    // Queue the cloud save through the same runtime message the popup uses,
    // then close the popup immediately (#35 AC: the upload must survive it).
    await popup.evaluate(async (capture) => {
      const chrome = (window as unknown as { chrome: ChromeRuntime }).chrome;
      await chrome.runtime.sendMessage({
        type: "transcriptly:cloud-save-enqueue",
        capture,
      });
    }, capturePayload);
    await popup.close();

    await expect
      .poll(() => web.uploads, { timeout: 20_000 })
      .toEqual([
        {
          capture: {
            source: { videoId: "e2etestvid1" },
            capturedAt: "2026-08-21T10:30:00.000Z",
          },
        },
      ]);

    // Reopening the popup shows a lightweight receipt and no payload.
    const reopened = await openPopup(context);
    interface CloudJobRecordShape {
      state: string;
      capture?: unknown;
      receipt?: { libraryItemId: string; outcome: string };
    }
    const records = (await reopened.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("transcriptly-cloud");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return new Promise((resolve, reject) => {
        const request = (database as IDBDatabase).transaction(
          "cloud-jobs",
          "readonly",
        );
        const getAll = request.objectStore("cloud-jobs").getAll();
        getAll.onsuccess = () => resolve(getAll.result);
        getAll.onerror = () => reject(getAll.error);
      });
    })) as CloudJobRecordShape[];

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record?.state).toBe("saved");
    expect(record?.capture).toBeUndefined();
    expect(record?.receipt).toMatchObject({
      libraryItemId: "lib-item-e2e",
      outcome: "created",
    });
  } finally {
    await context.close();
    await web.stop();
  }
});

test("signed-out popup never uploads a capture", async () => {
  const web = startMockWeb({ signedIn: false });
  await web.start();
  const context = await launchExtension();
  try {
    // The popup renders without a watch tab; the account section reports
    // the signed-out session, and the cloud destination is never offered
    // (the toggle lives in the capture view and stays unreachable).
    const popup = await openPopup(context);
    await expect(
      popup.getByRole("button", { name: "Sign in to Transcriptly" }),
    ).toBeVisible();

    // No capture upload request may happen from a signed-out popup session
    // (local-only saves never touch the network).
    await popup.waitForTimeout(1500);
    expect(web.uploads).toEqual([]);
  } finally {
    await context.close();
    await web.stop();
  }
});
