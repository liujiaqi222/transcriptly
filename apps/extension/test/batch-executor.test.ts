import type { Capture } from "@transcriptly/schema";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  type BatchExecutorDependencies,
  createBatchExecutor,
} from "../batch/executor";
import {
  type BatchVideo,
  createBatchJobStore,
  type LocalSaveOutcome,
} from "../batch/jobs";
import type { CloudFailure, CloudReceipt } from "../cloud/jobs";

const videos: BatchVideo[] = [
  {
    videoId: "abc12345678",
    url: "https://www.youtube.com/watch?v=abc12345678",
    title: "First video",
  },
  {
    videoId: "def12345678",
    url: "https://www.youtube.com/watch?v=def12345678",
    title: "Second video",
  },
  {
    videoId: "ghi12345678",
    url: "https://www.youtube.com/watch?v=ghi12345678",
    title: "Third video",
  },
];

function makeCapture(videoId: string): Capture {
  return {
    source: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Video ${videoId}`,
      channelName: "Ship It Weekly",
      channelHandle: "/@shipitweekly",
      description: "",
    },
    capturedAt: "2026-08-22T00:00:00.000Z",
    segments: [{ start: 0, text: "Hello" }],
  };
}

function makeCloudReceipt(videoId: string): CloudReceipt {
  return {
    videoId,
    libraryItemId: `item-${videoId}`,
    outcome: "created",
    savedAt: "2026-08-22T00:00:00.000Z",
  };
}

interface CloudJobStub {
  state: "pending" | "uploading" | "saved" | "failed";
  receipt?: CloudReceipt;
  failure?: CloudFailure;
}

function createHarness(overrides: Partial<BatchExecutorDependencies> = {}) {
  const store = createBatchJobStore({
    indexedDB: new IDBFactory(),
    newId: () => `task-${Math.random().toString(36).slice(2, 8)}`,
  });
  let clock = 1_000;
  const intervals: number[] = [];
  const cloudJobs = new Map<string, CloudJobStub>();
  const savedCaptures: Capture[] = [];

  const deps: BatchExecutorDependencies = {
    store,
    captureVideo: async (video) => makeCapture(video.videoId),
    preflightLocal: async () => ({
      status: "ok",
      directoryName: "Vault",
    }),
    saveLocal: async (capture) => {
      savedCaptures.push(capture);
      return {
        status: "saved",
        result: { directoryName: "Vault", filename: "a.md" },
      } satisfies LocalSaveOutcome;
    },
    enqueueCloud: async (capture) => {
      const jobId = `job-${capture.source.videoId}`;
      cloudJobs.set(jobId, { state: "pending" });
      return { jobId };
    },
    // The queue drains in the background: the first read of a pending job
    // completes it with a receipt.
    getCloudJob: async (jobId) => {
      const job = cloudJobs.get(jobId);
      if (job?.state === "pending") {
        job.state = "saved";
        job.receipt = makeCloudReceipt(jobId.replace("job-", ""));
      }
      return job;
    },
    findLocalReceipt: async () => undefined,
    findCloudReceipt: async () => undefined,
    delay: async (ms) => {
      intervals.push(ms);
      clock += ms;
    },
    now: () => clock,
    ...overrides,
  };
  const executor = createBatchExecutor(deps);
  return { store, executor, deps, cloudJobs, savedCaptures, intervals };
}

async function createTask(
  store: ReturnType<typeof createBatchJobStore>,
  list: BatchVideo[],
  destinations: ("local" | "cloud")[] = ["local", "cloud"],
) {
  return store.create(list, { destinations });
}

describe("batch executor", () => {
  it("uses the task's fixed Markdown format for every Local save", async () => {
    const formats: string[] = [];
    const harness = createHarness({
      saveLocal: async (_capture, format) => {
        formats.push(format);
        return {
          status: "saved",
          result: { directoryName: "Vault", filename: "a.md" },
        };
      },
    });
    const task = await harness.store.create(videos.slice(0, 2), {
      destinations: ["local"],
      markdownFormat: "article",
    });

    await harness.executor.wake();

    expect((await harness.store.get(task.id))?.state).toBe("completed");
    expect(formats).toEqual(["article", "article"]);
  });

  it("saves every video to both destinations and completes the task", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos);

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    expect(finished?.state).toBe("completed");
    expect(finished?.items.map((item) => [item.local, item.cloud])).toEqual([
      ["saved", "saved"],
      ["saved", "saved"],
      ["saved", "saved"],
    ]);
    expect(finished?.items[0]?.localReceipt?.filename).toBe("a.md");
    expect(finished?.items[0]?.cloudReceipt?.libraryItemId).toBe(
      "item-abc12345678",
    );
    expect(harness.savedCaptures).toHaveLength(3);
    // A pause between videos, single concurrency.
    expect(harness.intervals).toContain(2000);
  });

  it("stamps every finished item with attempt timings for the ETA (#58)", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos);

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    for (const item of finished?.items ?? []) {
      expect(typeof item.startedAt).toBe("number");
      expect(item.finishedAt).toBeDefined();
      expect(item.finishedAt).toBeGreaterThanOrEqual(
        item.startedAt ?? Number.NaN,
      );
    }
  });

  it("re-stamps attempt timing when an item is retried (#58)", async () => {
    const harness = createHarness({
      saveLocal: async (capture) => {
        if (capture.source.videoId === "abc12345678") {
          return { status: "error", message: "disk full" };
        }
        return {
          status: "saved",
          result: { directoryName: "Vault", filename: "a.md" },
        };
      },
    });
    const task = await createTask(harness.store, videos.slice(0, 2));

    await harness.executor.wake();

    const failed = await harness.store.get(task.id);
    const first = failed?.items[0];
    expect(first?.local).toBe("failed");
    expect(typeof first?.startedAt).toBe("number");
    expect(typeof first?.finishedAt).toBe("number");

    await harness.executor.retryItem(task.id, "abc12345678", ["local"]);

    const retried = await harness.store.get(task.id);
    const second = retried?.items[0];
    expect(second?.local).toBe("failed");
    expect(second?.startedAt).toBeGreaterThan(first?.startedAt ?? 0);
  });

  it("keeps local and cloud failures independent", async () => {
    const harness = createHarness({
      saveLocal: async (capture) =>
        capture.source.videoId === "abc12345678"
          ? ({
              status: "error",
              message: "disk full",
            } satisfies LocalSaveOutcome)
          : {
              status: "saved",
              result: { directoryName: "Vault", filename: "a.md" },
            },
    });
    const task = await createTask(harness.store, videos);

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    expect(finished?.items[0]).toMatchObject({
      local: "failed",
      localError: "disk full",
      cloud: "saved",
    });
    expect(finished?.items[1]).toMatchObject({ local: "saved" });
  });

  it("carries first-contribution disclosure on only the first Cloud Job", async () => {
    const enqueueCloud = vi.fn(
      async (
        capture: Capture,
        _options?: { confirmPublicProfile?: boolean },
      ) => ({
        jobId: `job-${capture.source.videoId}`,
      }),
    );
    const { store, executor, cloudJobs } = createHarness({
      enqueueCloud: async (capture, options) => {
        const result = await enqueueCloud(capture, options);
        cloudJobs.set(result.jobId, {
          state: "saved",
          receipt: makeCloudReceipt(capture.source.videoId),
        });
        return result;
      },
    });
    const task = await store.create(videos, {
      destinations: ["cloud"],
      publicProfileConfirmationPending: true,
    });

    await executor.wake();

    expect(enqueueCloud).toHaveBeenNthCalledWith(1, expect.anything(), {
      confirmPublicProfile: true,
    });
    expect(enqueueCloud).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      undefined,
    );
    expect((await store.get(task.id))?.publicProfileConfirmationPending).toBe(
      undefined,
    );
  });

  it("fails only cloud when the enqueue rejects", async () => {
    const harness = createHarness({
      enqueueCloud: async () => {
        throw new Error("storage quota");
      },
    });
    const task = await createTask(harness.store, videos.slice(0, 1));

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    expect(finished?.items[0]).toMatchObject({
      local: "saved",
      cloud: "failed",
      cloudError: "storage quota",
    });
  });

  it("marks a cloud upload failed with the server message", async () => {
    const harness = createHarness({
      getCloudJob: async () => ({
        state: "failed",
        failure: {
          kind: "permanent",
          code: "invalid_payload",
          message: "The cloud rejected the upload.",
        },
      }),
    });
    const task = await createTask(harness.store, videos.slice(0, 1));

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    expect(finished?.items[0]).toMatchObject({
      cloud: "failed",
      cloudError: "The cloud rejected the upload.",
    });
  });

  it("times out a cloud upload that never finishes", async () => {
    const harness = createHarness({
      getCloudJob: async () => ({ state: "pending" }),
    });
    const task = await createTask(harness.store, videos.slice(0, 1));

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    expect(finished?.items[0]?.cloud).toBe("failed");
    expect(finished?.items[0]?.cloudError).toContain("did not finish in time");
  });

  it("fails both destinations when the capture fails", async () => {
    const harness = createHarness({
      captureVideo: async () => {
        throw new Error("No transcript was found");
      },
    });
    const task = await createTask(harness.store, videos.slice(0, 1));

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    expect(finished?.items[0]).toMatchObject({
      local: "failed",
      localError: "No transcript was found",
      cloud: "failed",
      cloudError: "No transcript was found",
    });
    expect(finished?.state).toBe("completed");
  });

  it("skips a destination whose receipt appeared since creation", async () => {
    const receipt = {
      videoId: "abc12345678",
      filename: "first.md",
      directoryName: "Vault",
      savedAt: "2026-08-21T00:00:00.000Z",
    };
    const harness = createHarness({
      findLocalReceipt: async (videoId) =>
        videoId === "abc12345678" ? receipt : undefined,
    });
    const task = await createTask(harness.store, videos.slice(0, 2));

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    expect(finished?.items[0]).toMatchObject({
      local: "skipped",
      localReceipt: receipt,
      cloud: "saved",
    });
    // Only the second video needed a local write; both were still captured.
    expect(harness.savedCaptures).toHaveLength(1);
    expect(harness.savedCaptures[0]?.source.videoId).toBe("def12345678");
  });

  it("pauses between videos and resumes later", async () => {
    const harness = createHarness();
    let captureCalls = 0;
    const task = await createTask(harness.store, videos);
    const taskId = task.id;
    harness.deps.captureVideo = async (video) => {
      captureCalls += 1;
      if (captureCalls === 2) {
        const outcome = await harness.executor.pause(taskId);
        expect(outcome).toEqual({ ok: true });
      }
      return makeCapture(video.videoId);
    };

    await harness.executor.wake();
    const paused = await harness.store.get(taskId);
    expect(paused?.state).toBe("paused");
    expect(paused?.items[1]).toMatchObject({ local: "saved" });
    expect(paused?.items[2]).toMatchObject({ local: "queued" });

    expect(await harness.executor.resume(taskId)).toEqual({ ok: true });
    const finished = await harness.store.get(taskId);
    expect(finished?.state).toBe("completed");
  });

  it("stops pending items but lets the current video finish", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos);
    const taskId = task.id;
    let captureCalls = 0;
    const originalCapture = harness.deps.captureVideo;
    harness.deps.captureVideo = async (video) => {
      captureCalls += 1;
      if (captureCalls === 1) {
        await harness.executor.stop(taskId);
      }
      return originalCapture(video);
    };

    await harness.executor.wake();

    const stopped = await harness.store.get(taskId);
    expect(stopped?.state).toBe("stopped");
    expect(stopped?.items[0]).toMatchObject({ local: "saved" });
    expect(stopped?.items[1]).toMatchObject({ local: "cancelled" });
    expect(stopped?.items[2]).toMatchObject({ cloud: "cancelled" });
    // The capture of the second and third video never happened.
    expect(captureCalls).toBe(1);
  });

  it("retries a failed item after the batch finished", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos.slice(0, 1));
    const taskId = task.id;
    const originalCapture = harness.deps.captureVideo;
    let attempt = 0;
    harness.deps.captureVideo = async (video) => {
      attempt += 1;
      if (attempt === 1) throw new Error("tab crashed");
      return originalCapture(video);
    };

    await harness.executor.wake();
    let finished = await harness.store.get(taskId);
    expect(finished?.items[0]).toMatchObject({ local: "failed" });

    expect(await harness.executor.retryItem(taskId, "abc12345678")).toEqual({
      ok: true,
    });

    finished = await harness.store.get(taskId);
    expect(finished?.state).toBe("completed");
    expect(finished?.items[0]).toMatchObject({
      local: "saved",
      cloud: "saved",
    });
  });

  it("rejects retrying while the batch is still running", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos.slice(0, 1));
    const wake = harness.executor.wake();
    const outcome = await harness.executor.retryItem(task.id, "abc12345678");
    expect(outcome.ok).toBe(false);
    await wake;
  });

  it("rejects retrying an unknown video", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos.slice(0, 1));
    await harness.executor.wake();
    const outcome = await harness.executor.retryItem(task.id, "zzz12345678");
    expect(outcome).toMatchObject({ ok: false });
  });

  it("re-queues items interrupted by a service worker restart", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos.slice(0, 2));
    // Simulate a worker that died mid-video.
    task.state = "running";
    const interrupted = task.items[0];
    if (!interrupted) throw new Error("missing item");
    interrupted.local = "running";
    interrupted.cloud = "running";
    await harness.store.put(task);

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    expect(finished?.state).toBe("completed");
    expect(finished?.items.map((item) => [item.local, item.cloud])).toEqual([
      ["saved", "saved"],
      ["saved", "saved"],
    ]);
  });

  it("keeps a receipt-index failure as a warning on a saved item", async () => {
    const harness = createHarness({
      saveLocal: async () =>
        ({
          status: "saved",
          result: {
            directoryName: "Vault",
            filename: "a.md",
            receiptError: "Could not update the local save index: boom",
          },
        }) satisfies LocalSaveOutcome,
    });
    const task = await createTask(harness.store, videos.slice(0, 1));

    await harness.executor.wake();

    const finished = await harness.store.get(task.id);
    expect(finished?.items[0]).toMatchObject({
      local: "saved",
      localError: "Could not update the local save index: boom",
    });
  });

  it("does not process two tasks concurrently", async () => {
    const harness = createHarness();
    const first = await createTask(harness.store, videos.slice(0, 1));
    const second = await createTask(harness.store, videos.slice(1, 2));
    const inFlight: string[] = [];
    const originalCapture = harness.deps.captureVideo;
    harness.deps.captureVideo = async (video) => {
      inFlight.push(video.videoId);
      expect(inFlight).toHaveLength(1);
      const capture = await originalCapture(video);
      inFlight.pop();
      return capture;
    };

    await Promise.all([harness.executor.wake()]);
    expect((await harness.store.get(first.id))?.state).toBe("completed");
    expect((await harness.store.get(second.id))?.state).toBe("completed");
  });

  it("rejects stopping a finished batch", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos.slice(0, 1));
    await harness.executor.wake();
    const outcome = await harness.executor.stop(task.id);
    expect(outcome).toMatchObject({ ok: false });
  });

  // --- #59: ask-first interruption ---------------------------------

  it("pauses with local-permission when the preflight finds no grant, without opening a watch tab", async () => {
    const captureCalls: string[] = [];
    const harness = createHarness({
      preflightLocal: async () => ({ status: "permission-required" }),
      captureVideo: async (video) => {
        captureCalls.push(video.videoId);
        return makeCapture(video.videoId);
      },
    });
    const task = await createTask(harness.store, videos.slice(0, 2));

    await harness.executor.wake();

    const paused = await harness.store.get(task.id);
    expect(paused?.state).toBe("paused");
    expect(paused?.pauseReason).toBe("local-permission");
    // No watch tab, no capture, no failure - the item waits, queued.
    expect(captureCalls).toEqual([]);
    expect(paused?.items[0]).toMatchObject({
      local: "queued",
      cloud: "queued",
    });
    expect(paused?.items[0]?.localError).toBeUndefined();
  });

  it("pauses with local-permission when no save folder is selected at all", async () => {
    const harness = createHarness({
      preflightLocal: async () => ({ status: "no-directory" }),
    });
    const task = await createTask(harness.store, videos.slice(0, 1));

    await harness.executor.wake();

    const paused = await harness.store.get(task.id);
    expect(paused?.state).toBe("paused");
    expect(paused?.pauseReason).toBe("local-permission");
    expect(paused?.items[0]).toMatchObject({ local: "queued" });
  });

  it("pauses with local-save-unavailable when the preflight host is unreachable", async () => {
    const harness = createHarness({
      preflightLocal: async () => ({
        status: "unavailable",
        message: "manager page did not respond",
      }),
    });
    const task = await createTask(harness.store, videos.slice(0, 1));

    await harness.executor.wake();

    const paused = await harness.store.get(task.id);
    expect(paused?.state).toBe("paused");
    expect(paused?.pauseReason).toBe("local-save-unavailable");
    expect(paused?.items[0]).toMatchObject({ local: "queued" });
  });

  it("resumes from the interrupted item after a permission pause", async () => {
    let preflights = 0;
    const harness = createHarness({
      preflightLocal: async () => {
        preflights += 1;
        return preflights === 1
          ? { status: "permission-required" }
          : { status: "ok" as const, directoryName: "Vault" };
      },
    });
    const task = await createTask(harness.store, videos.slice(0, 2));

    await harness.executor.wake();
    const paused = await harness.store.get(task.id);
    expect(paused?.pauseReason).toBe("local-permission");

    expect(await harness.executor.resume(task.id)).toEqual({ ok: true });
    const finished = await harness.store.get(task.id);
    expect(finished?.state).toBe("completed");
    expect(finished?.pauseReason).toBeUndefined();
    expect(finished?.items.map((item) => [item.local, item.cloud])).toEqual([
      ["saved", "saved"],
      ["saved", "saved"],
    ]);
  });

  it("re-queues the local destination and keeps cloud results when permission dies mid-item", async () => {
    const harness = createHarness({
      saveLocal: async () => ({ status: "permission-required" }),
    });
    const task = await createTask(harness.store, videos.slice(0, 2));

    await harness.executor.wake();

    const paused = await harness.store.get(task.id);
    expect(paused?.state).toBe("paused");
    expect(paused?.pauseReason).toBe("local-permission");
    // The interrupted item: local back to queued (never failed), the
    // already-finished cloud half stays saved.
    expect(paused?.items[0]).toMatchObject({
      local: "queued",
      cloud: "saved",
      localError: undefined,
    });
    // Nothing else ran.
    expect(paused?.items[1]).toMatchObject({
      local: "queued",
      cloud: "queued",
    });
  });

  it("pauses with local-save-unavailable when the host dies mid-item", async () => {
    const harness = createHarness({
      saveLocal: async () => ({
        status: "unavailable",
        message: "stopped responding",
      }),
    });
    const task = await createTask(harness.store, videos.slice(0, 1));

    await harness.executor.wake();

    const paused = await harness.store.get(task.id);
    expect(paused?.state).toBe("paused");
    expect(paused?.pauseReason).toBe("local-save-unavailable");
    expect(paused?.items[0]).toMatchObject({ local: "queued", cloud: "saved" });
  });

  it("records the user as the pause reason and clears it on resume", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos.slice(0, 2));
    const taskId = task.id;
    let captureCalls = 0;
    const originalCapture = harness.deps.captureVideo;
    harness.deps.captureVideo = async (video) => {
      captureCalls += 1;
      if (captureCalls === 2) {
        await harness.executor.pause(taskId);
      }
      return originalCapture(video);
    };

    await harness.executor.wake();
    const paused = await harness.store.get(taskId);
    expect(paused?.pauseReason).toBe("user");

    await harness.executor.resume(taskId);
    const finished = await harness.store.get(taskId);
    expect(finished?.state).toBe("completed");
    expect(finished?.pauseReason).toBeUndefined();
  });

  it("does not resume a browser-restart pause on its own wake", async () => {
    const harness = createHarness();
    const task = await createTask(harness.store, videos.slice(0, 1));
    // Simulate the session gate's pause after a browser restart (#59):
    // an alarm-driven wake must leave it waiting for confirmation.
    task.state = "paused";
    task.pauseReason = "browser-restart";
    await harness.store.put(task);

    await harness.executor.wake();

    const still = await harness.store.get(task.id);
    expect(still?.state).toBe("paused");
    expect(still?.pauseReason).toBe("browser-restart");
    expect(harness.savedCaptures).toHaveLength(0);
  });
});
