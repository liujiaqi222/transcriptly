import { afterEach, describe, expect, it, vi } from "vitest";
import type { BatchCapsuleRuntime } from "../batch/capsule";
import { mountBatchProgressCapsule } from "../batch/capsule";
import type { BatchItemState, BatchTask } from "../batch/jobs";
import {
  BATCH_STATUS_REQUEST,
  type BatchStatusResult,
} from "../shared/messages";

const CHANNEL_VIDEOS_PATH = "/@eoglobal/videos";

function makeTask(overrides: Partial<BatchTask> = {}): BatchTask {
  const item = (
    videoId: string,
    local: BatchItemState,
    cloud: BatchItemState,
  ) => ({
    video: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Video ${videoId}`,
    },
    local,
    cloud,
  });
  return {
    id: "task-1",
    destinations: ["local"],
    items: [
      item("abc12345678", "saved", "skipped"),
      item("def12345678", "failed", "skipped"),
      item("ghi12345678", "running", "skipped"),
      item("jkl12345678", "queued", "skipped"),
    ],
    state: "running",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function createRuntime(tasks: BatchTask[]) {
  const managerTabs: string[] = [];
  const sendMessage = vi.fn(
    async (message: unknown): Promise<BatchStatusResult> => {
      if ((message as { type: string }).type === BATCH_STATUS_REQUEST) {
        return { tasks };
      }
      throw new Error("unexpected message");
    },
  );
  const runtime: BatchCapsuleRuntime = {
    sendMessage: sendMessage as unknown as BatchCapsuleRuntime["sendMessage"],
    openManagerTab: (taskId: string) => {
      managerTabs.push(taskId);
    },
  };
  return { runtime, sendMessage, managerTabs };
}

function navigateTo(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("yt-navigate-finish"));
}

function capsule(): HTMLElement {
  const element = document.getElementById("transcriptly-batch-capsule");
  if (!element) throw new Error("missing batch capsule");
  return element;
}

let teardown: (() => void) | undefined;

async function mount(tasks: BatchTask[]) {
  const created = createRuntime(tasks);
  const handle = mountBatchProgressCapsule(created.runtime);
  teardown = () => handle.teardown();
  // Let the initial sync settle.
  await vi.waitFor(() => {
    if (created.sendMessage.mock.calls.length === 0) {
      throw new Error("runtime not contacted");
    }
  });
  return created;
}

afterEach(() => {
  teardown?.();
  teardown = undefined;
  document.getElementById("transcriptly-batch-capsule")?.remove();
  document.getElementById("transcriptly-batch-capsule-styles")?.remove();
  window.history.pushState({}, "", "/");
});

describe("batch progress capsule (#58)", () => {
  it("shows done/total progress for a running batch on a batch source page", async () => {
    navigateTo(CHANNEL_VIDEOS_PATH);
    await mount([makeTask()]);

    // 2 of 4 items have nothing left to run.
    expect(capsule().textContent).toBe("Batch 2/4 ->");
  });

  it("prefers the newest running task", async () => {
    navigateTo(CHANNEL_VIDEOS_PATH);
    const newest = makeTask({
      id: "task-new",
      createdAt: 2,
      items: [
        {
          video: {
            videoId: "abc12345678",
            url: "https://www.youtube.com/watch?v=abc12345678",
            title: "First video",
          },
          local: "running",
          cloud: "skipped",
        },
      ],
    });
    const { managerTabs } = await mount([
      makeTask({ id: "task-old", createdAt: 1 }),
      newest,
    ]);

    expect(capsule().textContent).toBe("Batch 0/1 ->");
    capsule().click();
    expect(managerTabs).toEqual(["task-new"]);
  });

  it("opens the manager page on the running task when clicked", async () => {
    navigateTo(CHANNEL_VIDEOS_PATH);
    const { managerTabs } = await mount([makeTask()]);

    capsule().click();

    expect(managerTabs).toEqual(["task-1"]);
  });

  it("hides the capsule when no batch is running", async () => {
    navigateTo(CHANNEL_VIDEOS_PATH);
    await mount([
      makeTask({ id: "task-done", state: "completed", createdAt: 1 }),
    ]);

    expect(document.getElementById("transcriptly-batch-capsule")).toBeNull();
  });

  it("never renders outside batch source pages", async () => {
    navigateTo("/watch?v=abc12345678");
    const created = createRuntime([makeTask()]);
    const handle = mountBatchProgressCapsule(created.runtime);
    teardown = () => handle.teardown();
    // Let the initial sync settle: it contacts nothing off a batch source.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(document.getElementById("transcriptly-batch-capsule")).toBeNull();
    expect(created.sendMessage).not.toHaveBeenCalled();
  });

  it("disappears on SPA navigation away and returns on a batch source page", async () => {
    navigateTo(CHANNEL_VIDEOS_PATH);
    await mount([makeTask()]);
    expect(capsule().textContent).toContain("2/4");

    navigateTo("/");
    expect(document.getElementById("transcriptly-batch-capsule")).toBeNull();

    navigateTo(CHANNEL_VIDEOS_PATH);
    await vi.waitFor(() => {
      expect(capsule().textContent).toContain("2/4");
    });
  });

  it("updates the count on the next poll", async () => {
    vi.useFakeTimers();
    navigateTo(CHANNEL_VIDEOS_PATH);
    const { runtime, sendMessage } = createRuntime([makeTask()]);
    const handle = mountBatchProgressCapsule(runtime);
    teardown = () => handle.teardown();
    await vi.advanceTimersByTimeAsync(0);
    expect(capsule().textContent).toBe("Batch 2/4 ->");

    // Two more items finish while the page stays open.
    const task = makeTask();
    const third = task.items[2];
    const fourth = task.items[3];
    if (third) third.local = "saved";
    if (fourth) fourth.local = "saved";
    sendMessage.mockImplementation(async () => ({ tasks: [task] }));

    await vi.advanceTimersByTimeAsync(2000);
    expect(capsule().textContent).toBe("Batch 4/4 ->");
    vi.useRealTimers();
  });
});
