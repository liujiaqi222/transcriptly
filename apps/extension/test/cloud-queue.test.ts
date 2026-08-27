import type { Capture } from "@transcriptly/schema";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { type CloudJobStore, createCloudJobStore } from "../cloud/jobs";
import { classifyUploadFailure, createCloudUploadQueue } from "../cloud/queue";

function captureFor(videoId: string): Capture {
  return {
    source: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Video ${videoId}`,
      channelName: "Ship It Weekly",
      channelUrl: "https://www.youtube.com/@shipitweekly",
      description: "An episode.",
    },
    capturedAt: "2026-08-20T10:30:00.000Z",
    segments: [{ start: 0, text: "Hello." }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successResponse(
  outcome: "published" | "contributed" | "replaced" | "unchanged",
) {
  return jsonResponse({
    success: true,
    data: {
      contributionId: "contribution-1",
      videoId: "abc12345678",
      outcome,
      currentCapturedAt: "2026-08-20T10:30:00.000Z",
      processedAt: "2026-08-20T10:31:00.000Z",
    },
  });
}

function errorResponse(
  status: number,
  code: string,
  message = "Rejected.",
  retryable = false,
) {
  return jsonResponse(
    {
      success: false,
      error: { code, message, retryable, requestId: "req-1" },
    },
    status,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("cloud upload queue", () => {
  let nowMs: number;
  let store: CloudJobStore;
  let upload: Mock<(capture: Capture) => Promise<Response>>;
  let queue: ReturnType<typeof createCloudUploadQueue>;

  beforeEach(() => {
    nowMs = 1_000_000_000_000;
    store = createCloudJobStore({
      indexedDB: new IDBFactory(),
      now: () => nowMs,
      newId: () => crypto.randomUUID(),
    });
    upload = vi.fn(async (_capture: Capture) => successResponse("published"));
    queue = createCloudUploadQueue({
      store,
      client: { uploadCapture: upload },
      now: () => nowMs,
    });
  });

  async function waitForSaved(videoId: string) {
    await vi.waitFor(async () => {
      const queueStatus = await queue.getStatus(videoId);
      if (queueStatus.current?.state !== "saved") {
        throw new Error(`not saved yet: ${queueStatus.current?.state}`);
      }
    });
  }

  async function waitForFailed(videoId: string) {
    await vi.waitFor(async () => {
      const queueStatus = await queue.getStatus(videoId);
      if (queueStatus.current?.state !== "failed") {
        throw new Error(`not failed yet: ${queueStatus.current?.state}`);
      }
    });
  }

  it("uploads an enqueued capture once and stores a lightweight receipt", async () => {
    upload.mockResolvedValue(successResponse("contributed"));

    await queue.enqueue(captureFor("abc12345678"));
    await waitForSaved("abc12345678");

    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(captureFor("abc12345678"));

    const queueStatus = await queue.getStatus("abc12345678");
    expect(queueStatus.current?.receipt).toMatchObject({
      contributionId: "contribution-1",
      outcome: "contributed",
      contributedAt: new Date(nowMs).toISOString(),
    });
  });

  it.each([
    [
      "network error",
      "network",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
    [
      "HTTP 429",
      "retryable",
      async () => errorResponse(429, "rate_limited", "Slow down.", true),
    ],
    [
      "HTTP 500",
      "retryable",
      async () => errorResponse(500, "capture_store_failed", "Boom.", true),
    ],
    [
      "unreadable 200 response",
      "retryable",
      async () =>
        new Response("not json at all", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ],
  ])(
    "marks %s retryable and succeeds on an explicit retry",
    async (_, expectedKind, respond) => {
      upload
        .mockImplementationOnce(respond)
        .mockResolvedValueOnce(successResponse("unchanged"));

      const job = await queue.enqueue(captureFor("abc12345678"));
      await waitForFailed("abc12345678");

      const failed = (await queue.getStatus("abc12345678")).current;
      expect(failed?.failure?.kind).toBe(expectedKind);

      await queue.retry(job.id);
      await waitForSaved("abc12345678");

      expect(upload).toHaveBeenCalledTimes(2);
      const queueStatus = await queue.getStatus("abc12345678");
      expect(queueStatus.current?.receipt?.outcome).toBe("unchanged");
    },
  );

  it.each([
    ["HTTP 400 validation", 400, "capture_invalid"],
    ["HTTP 409 conflict", 409, "capture_timestamp_conflict"],
    ["HTTP 413 payload too large", 413, "payload_too_large"],
    ["HTTP 415 media type", 415, "unsupported_media_type"],
  ])("marks %s permanent with no retry", async (_, status, code) => {
    upload.mockResolvedValue(errorResponse(status, code));

    const job = await queue.enqueue(captureFor("abc12345678"));
    await waitForFailed("abc12345678");

    const queueStatus = await queue.getStatus("abc12345678");
    expect(queueStatus.current?.failure?.kind).toBe("permanent");
    expect(queueStatus.current?.failure?.code).toBe(code);

    const retried = await queue.retry(job.id);
    expect(retried).toBeUndefined();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("marks 401 as auth: no replay, retry works after signing in again", async () => {
    upload.mockResolvedValueOnce(errorResponse(401, "unauthenticated"));
    upload.mockResolvedValueOnce(successResponse("published"));

    const job = await queue.enqueue(captureFor("abc12345678"));
    await waitForFailed("abc12345678");

    const queueStatus = await queue.getStatus("abc12345678");
    expect(queueStatus.current?.failure?.kind).toBe("auth");
    // No automatic second attempt: only the explicit retry re-uploads.
    expect(upload).toHaveBeenCalledTimes(1);

    await queue.retry(job.id);
    await waitForSaved("abc12345678");
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("uploads one job at a time in FIFO order", async () => {
    const firstGate = deferred<void>();
    const started: string[] = [];
    upload.mockImplementation(async (capture: Capture) => {
      started.push(capture.source.videoId);
      if (capture.source.videoId === "aaaaaaaaaaa") await firstGate.promise;
      return successResponse("published");
    });

    await queue.enqueue(captureFor("aaaaaaaaaaa"));
    // Give the drain loop a tick to start the first upload.
    await vi.waitFor(() => expect(started).toEqual(["aaaaaaaaaaa"]));

    await queue.enqueue(captureFor("bbbbbbbbbbb"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The second job waits while the first is uploading.
    expect(started).toEqual(["aaaaaaaaaaa"]);

    firstGate.resolve();
    await waitForSaved("bbbbbbbbbbb");
    expect(started).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  });

  it("continues pending jobs after a worker restart via recoverAndDrain", async () => {
    // Simulate a worker that died before ever uploading: the job sits in
    // the store with no queue instance attached.
    const persisted = createCloudJobStore({
      indexedDB: new IDBFactory(),
      now: () => nowMs,
    });
    await persisted.enqueue(captureFor("abc12345678"));

    const restarted = createCloudUploadQueue({
      store: persisted,
      client: { uploadCapture: upload },
      now: () => nowMs,
    });
    await restarted.recoverAndDrain();
    await vi.waitFor(async () => {
      const queueStatus = await restarted.getStatus("abc12345678");
      if (queueStatus.current?.state !== "saved") {
        throw new Error(`not saved yet: ${queueStatus.current?.state}`);
      }
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("marks an interrupted uploading job failed and never replays it", async () => {
    const job = await store.enqueue(captureFor("abc12345678"));
    await store.markUploading(job.id);

    await queue.recoverAndDrain();

    const queueStatus = await queue.getStatus("abc12345678");
    expect(queueStatus.current?.state).toBe("failed");
    expect(queueStatus.current?.failure?.code).toBe("interrupted");
    expect(upload).not.toHaveBeenCalled();

    // An explicit retry does upload.
    await queue.retry(job.id);
    await waitForSaved("abc12345678");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("does not fail the in-flight upload when recovery runs mid-drain", async () => {
    // Regression: the per-minute alarm calls recoverAndDrain(), and
    // store.recover() used to mark ANY uploading Job as failed - including
    // the one this worker is actively uploading (#36 race).
    const gate = deferred<void>();
    upload.mockImplementation(async () => {
      await gate.promise;
      return successResponse("published");
    });

    await queue.enqueue(captureFor("abc12345678"));
    // The upload has started, so the Job is `uploading` in the store.
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    // The alarm fires mid-upload.
    await queue.recoverAndDrain();
    const midFlight = await queue.getStatus("abc12345678");
    expect(midFlight.current?.state).toBe("uploading");

    gate.resolve();
    await waitForSaved("abc12345678");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("drops every job and receipt on sign-out", async () => {
    await queue.enqueue(captureFor("abc12345678"));
    await waitForSaved("abc12345678");

    await queue.clearAll();

    const queueStatus = await queue.getStatus("abc12345678");
    expect(queueStatus.current).toBeUndefined();
    expect(queueStatus.failed).toEqual([]);
  });

  it("stores a replaced receipt when the cloud swaps the current transcript (#73)", async () => {
    upload.mockResolvedValue(successResponse("replaced"));

    await queue.enqueue(captureFor("abc12345678"));
    await waitForSaved("abc12345678");

    const queueStatus = await queue.getStatus("abc12345678");
    expect(queueStatus.current?.receipt).toMatchObject({
      contributionId: "contribution-1",
      outcome: "replaced",
    });
  });

  it("treats a 422 duplicate_transcript rejection as a permanent failure and logs the capture bug (#73)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    upload.mockResolvedValue(
      errorResponse(
        422,
        "duplicate_transcript",
        "The transcript is a whole-transcript duplication; capture the video again.",
      ),
    );

    const job = await queue.enqueue(captureFor("abc12345678"));
    await waitForFailed("abc12345678");

    const queueStatus = await queue.getStatus("abc12345678");
    expect(queueStatus.current?.failure?.kind).toBe("permanent");
    expect(queueStatus.current?.failure?.code).toBe("duplicate_transcript");
    expect(queueStatus.current?.failure?.message).toContain(
      "whole-transcript duplication",
    );

    // A provable duplication is an extension capture bug: it must be logged
    // loudly, not silently folded into the generic failure badge.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("capture bug"),
      expect.objectContaining({ videoId: "abc12345678" }),
    );
    errorSpy.mockRestore();

    // Permanent: retrying a capture-side defect cannot succeed.
    const retried = await queue.retry(job.id);
    expect(retried).toBeUndefined();
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("classifyUploadFailure", () => {
  it("classifies a dropped connection as a network failure", () => {
    const failure = classifyUploadFailure(new TypeError("fetch failed"));
    expect(failure.kind).toBe("network");
    expect(failure.code).toBe("network_error");
  });
});
