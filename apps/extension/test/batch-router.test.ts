import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import type { BatchExecutor } from "../batch/executor";
import { type BatchVideo, createBatchJobStore } from "../batch/jobs";
import { createBatchMessageRouter } from "../batch/router";
import type { CloudQueueStatus } from "../cloud/jobs";
import type { LocalDirectoryHandle } from "../local-save";
import type {
  BatchMessage,
  BatchMutationStatus,
  CloudSessionStatus,
} from "../shared/messages";

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
];

const directory: LocalDirectoryHandle = {
  name: "Vault",
  getFileHandle: vi.fn(),
  removeEntry: vi.fn(),
  queryPermission: vi.fn(async () => "granted" as PermissionState),
  requestPermission: vi.fn(),
};

function createHarness(
  options: {
    signedIn?: boolean;
    directory?: LocalDirectoryHandle;
    localReceipts?: { videoId: string; directoryName: string }[];
    cloudSavedVideoIds?: string[];
  } = {},
) {
  const store = createBatchJobStore({
    indexedDB: new IDBFactory(),
    newId: () => `task-${Math.random().toString(36).slice(2, 8)}`,
  });
  const executor: BatchExecutor = {
    wake: vi.fn(async () => undefined),
    pause: vi.fn(async (): Promise<BatchMutationStatus> => ({ ok: true })),
    resume: vi.fn(async (): Promise<BatchMutationStatus> => ({ ok: true })),
    stop: vi.fn(async (): Promise<BatchMutationStatus> => ({ ok: true })),
    retryItem: vi.fn(async (): Promise<BatchMutationStatus> => ({ ok: true })),
  };
  const router = createBatchMessageRouter({
    store,
    executor,
    getSavedDirectory: async () => options.directory,
    getLocalReceipts: async (directoryName?: string) =>
      (options.localReceipts ?? [])
        .map((receipt) => ({
          videoId: receipt.videoId,
          filename: `${receipt.videoId}.md`,
          directoryName: receipt.directoryName,
          savedAt: "2026-08-21T00:00:00.000Z",
        }))
        .filter(
          (receipt) =>
            directoryName === undefined ||
            receipt.directoryName === directoryName,
        ),
    getCloudStatus: async (videoId?: string): Promise<CloudQueueStatus> => {
      if (videoId && (options.cloudSavedVideoIds ?? []).includes(videoId)) {
        return {
          current: {
            id: `job-${videoId}`,
            videoId,
            title: "Saved",
            state: "saved",
            receipt: {
              videoId,
              libraryItemId: `item-${videoId}`,
              outcome: "created",
              savedAt: "2026-08-21T00:00:00.000Z",
            },
          },
          failed: [],
        };
      }
      return { failed: [] };
    },
    getCloudSession: async (): Promise<CloudSessionStatus> =>
      options.signedIn
        ? { status: "signed-in", email: "user@example.com" }
        : { status: "signed-out" },
  });
  return { store, executor, router };
}

describe("batch message router", () => {
  it("rejects a cloud destination when signed out", async () => {
    const { router, store, executor } = createHarness({
      signedIn: false,
      directory,
    });

    const result = await router.handle({
      type: "transcriptly:batch-start",
      videos,
      destinations: ["cloud"],
    });

    expect(result).toMatchObject({ ok: false });
    expect(await store.list()).toEqual([]);
    expect(executor.wake).not.toHaveBeenCalled();
  });

  it("rejects a local destination without a saved folder", async () => {
    const { router, store } = createHarness({ signedIn: true });

    const result = await router.handle({
      type: "transcriptly:batch-start",
      videos,
      destinations: ["local"],
    });

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("save folder"),
    });
    expect(await store.list()).toEqual([]);
  });

  it("creates a task with fresh receipts and wakes the executor", async () => {
    const { router, store, executor } = createHarness({
      signedIn: true,
      directory,
      localReceipts: [{ videoId: "abc12345678", directoryName: "Vault" }],
      cloudSavedVideoIds: ["def12345678"],
    });

    const result = await router.handle({
      type: "transcriptly:batch-start",
      videos,
      destinations: ["local", "cloud"],
    });

    expect(result).toMatchObject({ ok: true });
    expect(executor.wake).toHaveBeenCalled();
    const task = (await store.list())[0];
    if (!task) throw new Error("missing task");
    expect(task.destinations).toEqual(["local", "cloud"]);
    expect(task.items[0]).toMatchObject({ local: "skipped", cloud: "queued" });
    expect(task.items[1]).toMatchObject({ local: "queued", cloud: "skipped" });
  });

  it("rejects empty selections", async () => {
    const { router } = createHarness({ signedIn: true, directory });
    const result = await router.handle({
      type: "transcriptly:batch-start",
      videos: [],
      destinations: ["local"],
    });
    expect(result).toMatchObject({
      ok: false,
      message: "Select at least one video.",
    });
  });

  it("reports per-video saved flags for the page badges", async () => {
    const { router } = createHarness({
      directory,
      localReceipts: [{ videoId: "abc12345678", directoryName: "Vault" }],
      cloudSavedVideoIds: ["def12345678"],
    });

    const result = await router.handle({
      type: "transcriptly:batch-lookup-request",
      videoIds: ["abc12345678", "def12345678", "ghi12345678"],
    });

    expect(result).toEqual({
      videos: [
        { videoId: "abc12345678", localSaved: true, cloudSaved: false },
        { videoId: "def12345678", localSaved: false, cloudSaved: true },
        { videoId: "ghi12345678", localSaved: false, cloudSaved: false },
      ],
    });
  });

  it("returns a single task by id and recent tasks otherwise", async () => {
    const { router, store } = createHarness({ signedIn: true, directory });
    const first = await store.create(videos.slice(0, 1), {
      destinations: ["local"],
      now: 100,
    });
    const second = await store.create(videos.slice(1), {
      destinations: ["local"],
      now: 200,
    });

    const byId = await router.handle({
      type: "transcriptly:batch-status-request",
      taskId: first.id,
    });
    expect(byId).toMatchObject({ tasks: [first] });

    const recent = await router.handle({
      type: "transcriptly:batch-status-request",
    });
    expect(recent).toMatchObject({
      tasks: [second, first],
    });
  });

  it("delegates pause, stop, resume, and retry to the executor", async () => {
    const { router, executor } = createHarness({ signedIn: true, directory });

    await router.handle({
      type: "transcriptly:batch-pause",
      taskId: "task-1",
    });
    await router.handle({
      type: "transcriptly:batch-stop",
      taskId: "task-1",
    });
    await router.handle({
      type: "transcriptly:batch-resume",
      taskId: "task-1",
    });
    await router.handle({
      type: "transcriptly:batch-retry-item",
      taskId: "task-1",
      videoId: "abc12345678",
    });

    expect(executor.pause).toHaveBeenCalledWith("task-1");
    expect(executor.stop).toHaveBeenCalledWith("task-1");
    expect(executor.resume).toHaveBeenCalledWith("task-1");
    expect(executor.retryItem).toHaveBeenCalledWith(
      "task-1",
      "abc12345678",
      undefined,
    );
  });

  it("ignores non-batch messages", async () => {
    const { router } = createHarness();
    expect(
      await router.handle({
        type: "transcriptly:cloud-session-request",
      } as unknown as BatchMessage),
    ).toBeUndefined();
  });
});
