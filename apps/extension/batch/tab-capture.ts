import type { Capture, CaptureResult } from "@transcriptly/capture";
import {
  CAPTURE_REQUEST,
  CONTENT_PING,
  type ContentPingResponse,
} from "@/shared/messages";
import type { BatchVideo } from "./jobs";

/**
 * Opens one watch tab per video, waits for the content script, requests the
 * transcript capture, and always closes the tab (#26).
 *
 * The tab is opened in the FOREGROUND: YouTube does not initialize the
 * player (and therefore never loads the transcript) in an inactive tab, so
 * a background tab reliably reports no transcript.
 *
 * The transcript panel also renders lazily, so a single capture request
 * right after the page "loads" usually reports no transcript: each attempt
 * gets its own polling window and no-transcript failures are retried until
 * the video's total budget is exhausted.
 */

/** Total budget (tab load + all capture attempts) for one video. */
export const TAB_CAPTURE_TIMEOUT_MS = 90_000;
/** Polling window handed to a single capture request. */
export const CAPTURE_ATTEMPT_TIMEOUT_MS = 20_000;
/** Pause between two capture attempts. */
export const CAPTURE_RETRY_DELAY_MS = 2_000;
const PING_INTERVAL_MS = 500;

/** The tabs surface the executor needs; `browser.tabs` in production. */
export interface TabsApi {
  create(options: { url: string; active: boolean }): Promise<{ id?: number }>;
  remove(tabId: number): Promise<void>;
  sendMessage<T>(tabId: number, message: unknown): Promise<T>;
}

export interface TabVideoCaptureOptions {
  tabs: TabsApi;
  /** Total budget for one video; defaults to {@link TAB_CAPTURE_TIMEOUT_MS}. */
  timeoutMs?: number;
  delay?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** A bounded `captureVideo` for the batch executor. */
export type TabVideoCapture = (video: BatchVideo) => Promise<Capture>;

/** Failures that another attempt cannot fix. */
const PERMANENT_CAPTURE_KINDS = new Set(["not-a-watch-page"]);

export function createTabVideoCapture(
  options: TabVideoCaptureOptions,
): TabVideoCapture {
  const { tabs } = options;
  const timeoutMs = options.timeoutMs ?? TAB_CAPTURE_TIMEOUT_MS;
  const delay =
    options.delay ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => Date.now());

  async function withDeadline<T>(
    work: Promise<T>,
    deadline: number,
    message: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(message)),
            Math.max(0, deadline - now()),
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async function waitForContentScript(
    tabId: number,
    deadline: number,
    title: string,
  ): Promise<void> {
    // Poll the content script until it answers: the tab may still be
    // loading, and sendMessage rejects while no listener exists.
    for (;;) {
      try {
        await tabs.sendMessage<ContentPingResponse>(tabId, {
          type: CONTENT_PING,
        });
        return;
      } catch {
        if (now() >= deadline) {
          throw new Error(
            `The page for "${title}" did not finish loading in time.`,
          );
        }
        await delay(PING_INTERVAL_MS);
      }
    }
  }

  async function captureWithRetries(
    tabId: number,
    deadline: number,
    video: BatchVideo,
  ): Promise<Capture> {
    let lastFailure = `No transcript was found for "${video.title}".`;
    for (;;) {
      const remaining = deadline - now();
      if (remaining <= 0) {
        throw new Error(`Capturing "${video.title}" timed out: ${lastFailure}`);
      }
      const response = await withDeadline(
        tabs.sendMessage<CaptureResult>(tabId, {
          type: CAPTURE_REQUEST,
          timeoutMs: Math.min(CAPTURE_ATTEMPT_TIMEOUT_MS, remaining),
        }),
        deadline,
        `Capturing "${video.title}" timed out.`,
      );
      if (response.ok) {
        if (response.capture.segments.length > 0) return response.capture;
        lastFailure = `No transcript was found for "${video.title}".`;
      } else {
        lastFailure = response.message;
        if (PERMANENT_CAPTURE_KINDS.has(response.kind)) {
          throw new Error(response.message);
        }
      }
      if (now() >= deadline) {
        throw new Error(`Capturing "${video.title}" timed out: ${lastFailure}`);
      }
      await delay(CAPTURE_RETRY_DELAY_MS);
    }
  }

  return async (video) => {
    const deadline = now() + timeoutMs;
    let tabId: number | undefined;
    try {
      // Foreground on purpose: an inactive tab never loads the transcript.
      const tab = await tabs.create({ url: video.url, active: true });
      tabId = tab.id;
      if (tabId === undefined) {
        throw new Error("The watch tab could not be created.");
      }
      await waitForContentScript(tabId, deadline, video.title);
      return await captureWithRetries(tabId, deadline, video);
    } finally {
      if (tabId !== undefined) {
        await tabs.remove(tabId).catch(() => undefined);
      }
    }
  };
}
