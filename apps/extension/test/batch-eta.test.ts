import { describe, expect, it } from "vitest";
import {
  doneItemCount,
  estimateRemainingSeconds,
  failedItemCount,
  formatDuration,
  isFinishingCurrentVideo,
  pendingItemCount,
} from "../batch/eta";
import type { BatchItem, BatchTask } from "../batch/jobs";

function item(overrides: Partial<BatchItem> = {}): BatchItem {
  return {
    video: {
      videoId: "abc12345678",
      url: "https://www.youtube.com/watch?v=abc12345678",
      title: "First video",
    },
    local: "queued",
    cloud: "skipped",
    ...overrides,
  };
}

function task(overrides: Partial<BatchTask> = {}): BatchTask {
  return {
    id: "task-1",
    destinations: ["local"],
    items: [],
    state: "running",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("batch ETA (#58)", () => {
  it("counts done, pending and failed items per destination", () => {
    const subject = task({
      items: [
        item({ local: "saved" }),
        item({ local: "failed", localError: "disk full" }),
        item({ local: "running" }),
        item({ local: "queued" }),
        item({ local: "cancelled" }),
      ],
    });
    expect(doneItemCount(subject)).toBe(3);
    expect(pendingItemCount(subject)).toBe(2);
    expect(failedItemCount(subject)).toBe(1);
  });

  it("returns no estimate unless the batch is running", () => {
    const subject = task({
      state: "paused",
      items: [item({ local: "queued" })],
    });
    expect(estimateRemainingSeconds(subject)).toBeUndefined();
  });

  it("falls back to the planning constant before anything finished", () => {
    const subject = task({ items: [item({ local: "queued" })] });
    expect(estimateRemainingSeconds(subject)).toBe(18);
  });

  it("multiplies pending items by the average finished-item duration", () => {
    const finished = (seconds: number, offset: number): BatchItem =>
      item({
        local: "saved",
        startedAt: offset,
        finishedAt: offset + seconds * 1000,
      });
    const subject = task({
      items: [
        finished(10, 0),
        finished(20, 1000),
        item({ local: "queued" }),
        item({ local: "queued" }),
      ],
    });
    // Average of 10 s and 20 s is 15 s per remaining video.
    expect(estimateRemainingSeconds(subject)).toBe(30);
  });

  it("uses only the most recent durations in the sliding window", () => {
    const finished = (seconds: number, offset: number): BatchItem =>
      item({
        local: "saved",
        startedAt: offset,
        finishedAt: offset + seconds * 1000,
      });
    const subject = task({
      items: [
        // Finished first (at t=9000) - outside the window.
        item({ local: "saved", startedAt: 0, finishedAt: 9000 }),
        finished(10, 10),
        finished(10, 11),
        finished(10, 12),
        finished(10, 13),
        finished(10, 14),
        item({ local: "queued" }),
      ],
    });
    // Window is the 5 most recent, all 10 s: 1 pending x 10 s.
    expect(estimateRemainingSeconds(subject)).toBe(10);
  });

  it("returns nothing when nothing is pending", () => {
    const subject = task({ items: [item({ local: "saved" })] });
    expect(estimateRemainingSeconds(subject)).toBeUndefined();
  });

  it("formats seconds and minutes", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(90)).toBe("2 min");
    expect(formatDuration(180)).toBe("3 min");
  });

  it("spots the finishing window of a pause", () => {
    // Mid-item user pause: the in-flight destination is still running.
    expect(
      isFinishingCurrentVideo(
        task({ state: "paused", items: [item({ local: "running" })] }),
      ),
    ).toBe(true);
    // A settled pause (any reason) has nothing running anymore.
    expect(
      isFinishingCurrentVideo(
        task({ state: "paused", items: [item({ local: "queued" })] }),
      ),
    ).toBe(false);
    // A running task is never "finishing".
    expect(
      isFinishingCurrentVideo(
        task({ state: "running", items: [item({ local: "running" })] }),
      ),
    ).toBe(false);
  });
});
