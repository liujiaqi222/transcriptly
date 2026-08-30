import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { type BatchVideo, createBatchJobStore } from "../batch/jobs";

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

describe("batch job store", () => {
  it("skips known receipts independently for each destination", async () => {
    const store = createBatchJobStore({
      indexedDB: new IDBFactory(),
      newId: () => "task-1",
    });
    const task = await store.create(videos, {
      destinations: ["local", "cloud"],
      markdownFormat: "article",
      localReceipts: [
        {
          videoId: "abc12345678",
          filename: "first.md",
          directoryName: "Vault",
          savedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      cloudReceipts: [
        {
          videoId: "def12345678",
          libraryItemId: "library-2",
          outcome: "created",
          savedAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      now: 10,
    });

    expect(task.items.map((item) => [item.local, item.cloud])).toEqual([
      ["skipped", "queued"],
      ["queued", "skipped"],
    ]);
    expect((await store.get("task-1"))?.destinations).toEqual([
      "local",
      "cloud",
    ]);
    expect((await store.get("task-1"))?.markdownFormat).toBe("article");
  });

  it("persists task-local destinations without changing any global setting", async () => {
    const store = createBatchJobStore({ indexedDB: new IDBFactory() });
    const task = await store.create(videos, { destinations: ["cloud"] });

    expect(task.destinations).toEqual(["cloud"]);
    expect(task.items.every((item) => item.local === "skipped")).toBe(true);
    expect(task.items.every((item) => item.cloud === "queued")).toBe(true);
  });

  it("persists saved and runnable videos in the same task", async () => {
    const store = createBatchJobStore({
      indexedDB: new IDBFactory(),
      newId: () => "task-1",
    });
    const savedCount = 50;
    const runnableCount = 75;
    const selection = Array.from(
      { length: savedCount + runnableCount },
      (_, index) => ({
        videoId: `${String(index).padStart(11, "0")}`,
        url: `https://www.youtube.com/watch?v=${String(index).padStart(11, "0")}`,
        title: `Video ${index}`,
      }),
    );
    const localReceipts = selection.slice(0, savedCount).map((video) => ({
      videoId: video.videoId,
      filename: `${video.videoId}.md`,
      directoryName: "Vault",
      savedAt: "2026-08-21T00:00:00.000Z",
    }));

    const task = await store.create(selection, {
      destinations: ["local"],
      localReceipts,
    });

    expect(task.items).toHaveLength(savedCount + runnableCount);
    expect(task.items.filter((item) => item.local === "skipped")).toHaveLength(
      savedCount,
    );
    expect(task.items.filter((item) => item.local === "queued")).toHaveLength(
      runnableCount,
    );
  });

  it("accepts more than the previous 50-video limit", async () => {
    const store = createBatchJobStore({ indexedDB: new IDBFactory() });
    const largeSelection = Array.from({ length: 120 }, (_, index) => ({
      videoId: `${String(index).padStart(11, "0")}`,
      url: `https://www.youtube.com/watch?v=${String(index).padStart(11, "0")}`,
      title: `Video ${index}`,
    }));

    const task = await store.create(largeSelection, {
      destinations: ["local"],
    });

    expect(task.items).toHaveLength(120);
    expect(task.items.every((item) => item.local === "queued")).toBe(true);
  });
});
