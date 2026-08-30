import type { Capture } from "@transcriptly/schema";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type CloudJobStore,
  createCloudJobStore,
  FAILED_JOB_RETENTION_MS,
} from "../cloud/jobs";

function captureFor(videoId: string, title = "Ship It"): Capture {
  return {
    source: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      channelName: "Ship It Weekly",
      channelHandle: "/@shipitweekly",
      description: "An episode.",
    },
    capturedAt: "2026-08-20T10:30:00.000Z",
    segments: [{ start: 0, text: "Hello." }],
  };
}

describe("cloud job store", () => {
  let nowMs: number;
  let nextId: number;
  let store: CloudJobStore;

  beforeEach(() => {
    nowMs = 1_000_000_000_000;
    nextId = 1;
    store = createCloudJobStore({
      indexedDB: new IDBFactory(),
      now: () => nowMs,
      newId: () => `job-${nextId++}`,
    });
  });

  it("persists a pending job with the full capture payload", async () => {
    const job = await store.enqueue(captureFor("abc12345678"));

    expect(job.state).toBe("pending");
    expect(job.kind).toBe("cloud-upload");
    expect(job.capture).toEqual(captureFor("abc12345678"));
    expect(job.createdAt).toBe(nowMs);
  });

  it("replaces the payload of a pending job for the same videoId", async () => {
    const first = await store.enqueue(captureFor("abc12345678", "Old title"));
    nowMs += 5_000;
    const second = await store.enqueue(captureFor("abc12345678", "New title"));

    expect(second.id).toBe(first.id);
    expect(second.title).toBe("New title");
    // FIFO position is preserved by keeping the original createdAt.
    expect(second.createdAt).toBe(first.createdAt);

    const next = await store.takeNextPending();
    expect(next?.id).toBe(first.id);
    expect(next?.capture?.source.title).toBe("New title");
  });

  it("queues a separate job when the same videoId is uploading", async () => {
    const first = await store.enqueue(captureFor("abc12345678"));
    await store.markUploading(first.id);

    const second = await store.enqueue(captureFor("abc12345678"));
    expect(second.id).not.toBe(first.id);

    // The uploading job is not preempted: it stays ahead in FIFO order.
    const next = await store.takeNextPending();
    expect(next?.id).toBe(second.id);
  });

  it("supersedes a failed job for the same videoId back into pending", async () => {
    const first = await store.enqueue(captureFor("abc12345678"));
    await store.markUploading(first.id);
    await store.completeFailed(first.id, {
      kind: "retryable",
      code: "interrupted",
      message: "interrupted",
    });

    const second = await store.enqueue(captureFor("abc12345678", "Retry me"));
    expect(second.id).toBe(first.id);
    expect(second.state).toBe("pending");
    expect(second.failure).toBeUndefined();
    expect(second.receipt).toBeUndefined();
  });

  it("claims a pending job atomically before a replacement can be enqueued", async () => {
    const first = await store.enqueue(captureFor("abc12345678", "Old title"));

    const claimed = await store.claimNextPending();
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.state).toBe("uploading");

    const second = await store.enqueue(captureFor("abc12345678", "New title"));
    expect(second.id).not.toBe(first.id);
    expect(second.state).toBe("pending");
    expect(second.capture?.source.title).toBe("New title");

    const next = await store.claimNextPending();
    expect(next?.id).toBe(second.id);
    expect(next?.state).toBe("uploading");
  });

  it("drains pending jobs in FIFO order", async () => {
    await store.enqueue(captureFor("aaaaaaaaaaa"));
    nowMs += 1_000;
    await store.enqueue(captureFor("bbbbbbbbbbb"));
    nowMs += 1_000;
    await store.enqueue(captureFor("ccccccccccc"));

    // takeNextPending never removes a job; the runner advances it via
    // markUploading, which is what actually moves it out of `pending`.
    const drain = async (): Promise<string[]> => {
      const ids: string[] = [];
      for (;;) {
        const job = await store.takeNextPending();
        if (!job) return ids;
        ids.push(job.videoId);
        await store.markUploading(job.id);
      }
    };

    expect(await drain()).toEqual([
      "aaaaaaaaaaa",
      "bbbbbbbbbbb",
      "ccccccccccc",
    ]);
    expect(await store.takeNextPending()).toBeUndefined();
  });

  it("completes a saved job by dropping the payload and keeping a receipt", async () => {
    const job = await store.enqueue(captureFor("abc12345678"));
    await store.markUploading(job.id);
    nowMs += 2_000;
    await store.completeSaved(job.id, {
      videoId: "abc12345678",
      libraryItemId: "item-1",
      outcome: "created",
      savedAt: new Date(nowMs).toISOString(),
    });

    const queueStatus = await store.getStatus("abc12345678");
    expect(queueStatus.current?.state).toBe("saved");
    expect(queueStatus.current?.receipt).toEqual({
      videoId: "abc12345678",
      libraryItemId: "item-1",
      outcome: "created",
      savedAt: new Date(nowMs).toISOString(),
    });

    const pending = await store.takeNextPending();
    expect(pending).toBeUndefined();
  });

  it("keeps only the newest saved receipt per videoId", async () => {
    const first = await store.enqueue(captureFor("abc12345678"));
    await store.markUploading(first.id);
    await store.completeSaved(first.id, {
      videoId: "abc12345678",
      libraryItemId: "item-1",
      outcome: "created",
      savedAt: new Date(nowMs).toISOString(),
    });

    nowMs += 60_000;
    const second = await store.enqueue(captureFor("abc12345678", "Updated"));
    await store.markUploading(second.id);
    await store.completeSaved(second.id, {
      videoId: "abc12345678",
      libraryItemId: "item-1",
      outcome: "updated",
      savedAt: new Date(nowMs).toISOString(),
    });

    const queueStatus = await store.getStatus("abc12345678");
    expect(queueStatus.current?.receipt?.outcome).toBe("updated");

    // The older receipt for the same video is gone; only one record remains.
    const failed = await store.getStatus();
    expect(failed.failed).toEqual([]);
    expect(queueStatus.current?.id).toBe(second.id);
  });

  it("keeps the payload of a failed job for an explicit retry", async () => {
    const job = await store.enqueue(captureFor("abc12345678"));
    await store.markUploading(job.id);
    await store.completeFailed(job.id, {
      kind: "auth",
      code: "unauthenticated",
      message: "Sign in again.",
      httpStatus: 401,
    });

    let queueStatus = await store.getStatus("abc12345678");
    expect(queueStatus.current?.state).toBe("failed");
    expect(queueStatus.current?.failure?.kind).toBe("auth");
    expect(queueStatus.failed).toHaveLength(1);

    const retried = await store.retry(job.id);
    expect(retried?.state).toBe("pending");
    expect(retried?.capture).toEqual(captureFor("abc12345678"));

    queueStatus = await store.getStatus("abc12345678");
    expect(queueStatus.current?.state).toBe("pending");
    expect(queueStatus.failed).toHaveLength(0);
  });

  it("marks jobs stuck in uploading as failed instead of replaying them", async () => {
    const job = await store.enqueue(captureFor("abc12345678"));
    await store.markUploading(job.id);

    await store.recover();

    const queueStatus = await store.getStatus("abc12345678");
    expect(queueStatus.current?.state).toBe("failed");
    expect(queueStatus.current?.failure?.kind).toBe("retryable");
    expect(queueStatus.current?.failure?.code).toBe("interrupted");
    // Recovery never re-uploads on its own.
    expect(await store.takeNextPending()).toBeUndefined();
  });

  it("deletes failed jobs whose payload expired after 7 days", async () => {
    const job = await store.enqueue(captureFor("abc12345678"));
    await store.markUploading(job.id);
    await store.completeFailed(job.id, {
      kind: "retryable",
      code: "network_error",
      message: "offline",
    });

    nowMs += FAILED_JOB_RETENTION_MS - 1_000;
    await store.recover();
    expect((await store.getStatus()).failed).toHaveLength(1);

    nowMs += 2_000;
    await store.recover();
    expect((await store.getStatus()).failed).toHaveLength(0);
  });

  it("clears every job and receipt on sign-out", async () => {
    const saved = await store.enqueue(captureFor("abc12345678"));
    await store.markUploading(saved.id);
    await store.completeSaved(saved.id, {
      videoId: "abc12345678",
      libraryItemId: "item-1",
      outcome: "created",
      savedAt: new Date(nowMs).toISOString(),
    });
    const failed = await store.enqueue(captureFor("bbbbbbbbbbb"));
    await store.markUploading(failed.id);
    await store.completeFailed(failed.id, {
      kind: "retryable",
      code: "network_error",
      message: "offline",
    });

    await store.clearAll();

    const queueStatus = await store.getStatus();
    expect(queueStatus.failed).toEqual([]);
    expect(queueStatus.current).toBeUndefined();
  });
});
