import type { Capture } from "@transcriptly/schema";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  type BatchExecutorDependencies,
  createBatchExecutor,
} from "../batch/executor";
import { type BatchVideo, createBatchJobStore } from "../batch/jobs";
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
      channelUrl: "https://www.youtube.com/@shipitweekly",
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
    saveLocal: async (capture) => {
      savedCaptures.push(capture);
      return { directoryName: "Vault", filename: "a.md" };
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

  it("keeps local and cloud failures independent", async () => {
    const harness = createHarness({
      saveLocal: async (capture) => {
        if (capture.source.videoId === "abc12345678") {
          throw new Error("disk full");
        }
        return { directoryName: "Vault", filename: "a.md" };
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
      saveLocal: async () => ({
        directoryName: "Vault",
        filename: "a.md",
        receiptError: "Could not update the local save index: boom",
      }),
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
});
