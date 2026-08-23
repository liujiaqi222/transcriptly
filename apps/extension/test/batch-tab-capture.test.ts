import type { Capture } from "@transcriptly/schema";
import { describe, expect, it, vi } from "vitest";
import type { BatchVideo } from "../batch/jobs";
import { createTabVideoCapture, type TabsApi } from "../batch/tab-capture";
import { CAPTURE_REQUEST, CONTENT_PING } from "../shared/messages";

const video: BatchVideo = {
  videoId: "abc12345678",
  url: "https://www.youtube.com/watch?v=abc12345678",
  title: "First video",
};

const capture: Capture = {
  source: {
    videoId: "abc12345678",
    url: video.url,
    title: "First video",
    channelName: "Ship It Weekly",
    channelUrl: "https://www.youtube.com/@shipitweekly",
    description: "",
  },
  capturedAt: "2026-08-22T00:00:00.000Z",
  segments: [{ start: 0, text: "Hello" }],
};

interface TabsHarness {
  tabs: TabsApi;
  sendMessage: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function createTabs(options: {
  pingFailures?: number;
  captureResponses?: unknown[];
}): TabsHarness {
  let pings = 0;
  let captures = 0;
  const create = vi.fn(async () => ({ id: 42 }));
  const remove = vi.fn(async () => undefined);
  const sendMessage = vi.fn(
    async <T>(_tabId: number, message: unknown): Promise<T> => {
      if ((message as { type: string }).type === CONTENT_PING) {
        pings += 1;
        if (pings <= (options.pingFailures ?? 0)) {
          throw new Error("Receiving end does not exist");
        }
        return { ok: true } as T;
      }
      if ((message as { type: string }).type === CAPTURE_REQUEST) {
        const responses = options.captureResponses ?? [];
        const index = Math.min(captures, responses.length - 1);
        captures += 1;
        return responses[index] as T;
      }
      throw new Error("unexpected message");
    },
  );
  return {
    tabs: { create, remove, sendMessage } as unknown as TabsApi,
    sendMessage,
    create,
    remove,
  };
}

function fakeClock() {
  let clock = 1_000;
  return {
    now: () => clock,
    delay: async (ms: number) => {
      clock += ms;
    },
  };
}

function captureRequests(sendMessage: ReturnType<typeof vi.fn>): {
  timeoutMs?: number;
}[] {
  return sendMessage.mock.calls
    .filter(
      ([, message]) => (message as { type: string }).type === CAPTURE_REQUEST,
    )
    .map(([, message]) => message as { timeoutMs?: number });
}

describe("tab video capture", () => {
  it("opens a foreground tab, waits for the content script, captures, and closes the tab", async () => {
    const harness = createTabs({
      pingFailures: 2,
      captureResponses: [{ ok: true, capture }],
    });
    const captureVideo = createTabVideoCapture({
      tabs: harness.tabs,
      ...fakeClock(),
    });

    const result = await captureVideo(video);

    expect(result).toEqual(capture);
    expect(harness.create).toHaveBeenCalledWith({
      url: video.url,
      active: true,
    });
    expect(harness.remove).toHaveBeenCalledWith(42);
    expect(harness.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(3);
    // The capture request carries a polling window for the content script.
    expect(captureRequests(harness.sendMessage)[0]?.timeoutMs).toBeGreaterThan(
      0,
    );
  });

  it("retries a no-transcript failure until the transcript renders", async () => {
    const harness = createTabs({
      captureResponses: [
        {
          ok: false,
          kind: "no-transcript",
          message: "No usable transcript was found",
        },
        {
          ok: false,
          kind: "no-transcript",
          message: "No usable transcript was found",
        },
        { ok: true, capture },
      ],
    });
    const captureVideo = createTabVideoCapture({
      tabs: harness.tabs,
      ...fakeClock(),
    });

    const result = await captureVideo(video);

    expect(result).toEqual(capture);
    expect(captureRequests(harness.sendMessage)).toHaveLength(3);
    expect(harness.remove).toHaveBeenCalledWith(42);
  });

  it("fails fast on a permanent capture failure", async () => {
    const harness = createTabs({
      captureResponses: [
        {
          ok: false,
          kind: "not-a-watch-page",
          message: "URL is not a YouTube watch page",
        },
      ],
    });
    const captureVideo = createTabVideoCapture({
      tabs: harness.tabs,
      ...fakeClock(),
    });

    await expect(captureVideo(video)).rejects.toThrow(
      "URL is not a YouTube watch page",
    );
    expect(captureRequests(harness.sendMessage)).toHaveLength(1);
    expect(harness.remove).toHaveBeenCalledWith(42);
  });

  it("rejects a capture with an empty transcript after retries", async () => {
    const harness = createTabs({
      captureResponses: [{ ok: true, capture: { ...capture, segments: [] } }],
    });
    const captureVideo = createTabVideoCapture({
      tabs: harness.tabs,
      ...fakeClock(),
      timeoutMs: 10_000,
    });

    await expect(captureVideo(video)).rejects.toThrow(
      "No transcript was found",
    );
    expect(harness.remove).toHaveBeenCalledWith(42);
  });

  it("rejects a capture returned for a different video", async () => {
    const mismatchedCapture: Capture = {
      ...capture,
      source: {
        ...capture.source,
        videoId: "other123456",
        url: "https://www.youtube.com/watch?v=other123456",
        title: "Another creator's video",
        channelName: "Another creator",
      },
    };
    const harness = createTabs({
      captureResponses: [{ ok: true, capture: mismatchedCapture }],
    });
    const captureVideo = createTabVideoCapture({
      tabs: harness.tabs,
      ...fakeClock(),
    });

    await expect(captureVideo(video)).rejects.toThrow(
      "returned a different video",
    );
    expect(harness.remove).toHaveBeenCalledWith(42);
  });

  it("times out when the content script never answers", async () => {
    const harness = createTabs({
      pingFailures: Number.MAX_SAFE_INTEGER,
    });
    const captureVideo = createTabVideoCapture({
      tabs: harness.tabs,
      ...fakeClock(),
      timeoutMs: 5_000,
    });

    await expect(captureVideo(video)).rejects.toThrow(
      "did not finish loading in time",
    );
    expect(harness.remove).toHaveBeenCalledWith(42);
  });

  it("times out when every capture attempt fails", async () => {
    const harness = createTabs({
      captureResponses: [
        {
          ok: false,
          kind: "no-transcript",
          message: "No usable transcript was found",
        },
      ],
    });
    const captureVideo = createTabVideoCapture({
      tabs: harness.tabs,
      ...fakeClock(),
      timeoutMs: 10_000,
    });

    await expect(captureVideo(video)).rejects.toThrow(
      "timed out: No usable transcript was found",
    );
    expect(harness.remove).toHaveBeenCalledWith(42);
  });

  it("times out when the capture request hangs", async () => {
    const sendMessage = vi.fn(
      async <T>(_tabId: number, message: unknown): Promise<T> => {
        if ((message as { type: string }).type === CONTENT_PING) {
          return { ok: true } as T;
        }
        return new Promise<T>(() => {});
      },
    );
    const tabs = {
      create: vi.fn(async () => ({ id: 42 })),
      remove: vi.fn(async () => undefined),
      sendMessage,
    } as unknown as TabsApi;
    const captureVideo = createTabVideoCapture({
      tabs,
      ...fakeClock(),
      timeoutMs: 50,
    });

    await expect(captureVideo(video)).rejects.toThrow("timed out");
    expect(tabs.remove).toHaveBeenCalledWith(42);
  });

  it("fails when the tab cannot be created", async () => {
    const tabs = {
      create: vi.fn(async () => ({ id: undefined })),
      remove: vi.fn(async () => undefined),
      sendMessage: vi.fn(async () => {
        throw new Error("unused");
      }),
    } as unknown as TabsApi;
    const captureVideo = createTabVideoCapture({
      tabs,
      ...fakeClock(),
    });

    await expect(captureVideo(video)).rejects.toThrow(
      "The watch tab could not be created.",
    );
    expect(tabs.remove).not.toHaveBeenCalled();
  });
});
