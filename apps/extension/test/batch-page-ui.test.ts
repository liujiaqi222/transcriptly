import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BatchTask } from "../batch/jobs";
import { type BatchPageRuntime, mountBatchPageUi } from "../batch/page-ui";
import {
  BATCH_LOOKUP_REQUEST,
  BATCH_PAUSE,
  BATCH_RETRY_ITEM,
  BATCH_START,
  BATCH_STATUS_REQUEST,
  BATCH_STOP,
  type BatchLookupResult,
  type BatchStartStatus,
  type BatchStatusResult,
  CLOUD_SESSION_REQUEST,
  type CloudSessionStatus,
} from "../shared/messages";

const PAGE_URL = "https://www.youtube.com/@eoglobal/videos";

function videoAnchors(): string {
  return `
    <div id="feed">
      <ytd-rich-item-renderer>
        <a id="link-a" href="https://www.youtube.com/watch?v=abc12345678" title="First video"><span id="video-title">First video</span></a>
      </ytd-rich-item-renderer>
      <ytd-rich-item-renderer>
        <a id="link-b" href="https://www.youtube.com/watch?v=def12345678" title="Second video"><span id="video-title">Second video</span></a>
      </ytd-rich-item-renderer>
    </div>
  `;
}

function makeTask(overrides: Partial<BatchTask> = {}): BatchTask {
  return {
    id: "task-1",
    destinations: ["local", "cloud"],
    items: [
      {
        video: {
          videoId: "abc12345678",
          url: "https://www.youtube.com/watch?v=abc12345678",
          title: "First video",
        },
        local: "saved",
        cloud: "saved",
      },
      {
        video: {
          videoId: "def12345678",
          url: "https://www.youtube.com/watch?v=def12345678",
          title: "Second video",
        },
        local: "failed",
        cloud: "queued",
        localError: "disk full",
      },
    ],
    state: "completed",
    createdAt: Date.parse("2026-08-22T00:00:00.000Z"),
    updatedAt: Date.parse("2026-08-22T00:00:01.000Z"),
    ...overrides,
  };
}

interface RuntimeOptions {
  session?: CloudSessionStatus;
  cloudPreference?: boolean;
  startStatus?: BatchStartStatus;
  tasks?: BatchTask[];
  saved?: Record<string, { local: boolean; cloud: boolean }>;
}

function createRuntime(options: RuntimeOptions = {}) {
  const sent: unknown[] = [];
  const sendMessage = vi.fn(
    async <T>(message: { type: string; videoIds?: string[] }): Promise<T> => {
      sent.push(message);
      switch (message.type) {
        case CLOUD_SESSION_REQUEST:
          return (options.session ?? { status: "signed-out" }) as T;
        case BATCH_LOOKUP_REQUEST: {
          const result: BatchLookupResult = {
            videos: (message.videoIds ?? []).map((videoId) => ({
              videoId,
              localSaved: options.saved?.[videoId]?.local ?? false,
              cloudSaved: options.saved?.[videoId]?.cloud ?? false,
            })),
          };
          return result as T;
        }
        case BATCH_START:
          return (options.startStatus ?? {
            ok: true,
            taskId: "task-1",
          }) as T;
        case BATCH_STATUS_REQUEST: {
          const result: BatchStatusResult = {
            tasks: options.tasks ?? [],
          };
          return result as T;
        }
        default:
          return { ok: true } as T;
      }
    },
  );
  const runtime: BatchPageRuntime & {
    sent: unknown[];
    callCount(): number;
  } = {
    sendMessage: sendMessage as BatchPageRuntime["sendMessage"],
    getCloudPreference: async () => options.cloudPreference ?? false,
    pageUrl: PAGE_URL,
    sent,
    callCount: () => sendMessage.mock.calls.length,
  };
  return runtime;
}

function requiredCheckbox(): HTMLInputElement {
  const checkbox = document.querySelector<HTMLInputElement>(
    ".transcriptly-batch-checkbox",
  );
  if (!checkbox) throw new Error("missing batch checkbox");
  return checkbox;
}

function selectFirstVideo(): void {
  const checkbox = requiredCheckbox();
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickStart(): void {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-action="start"]',
  );
  if (!button) throw new Error("missing start button");
  button.click();
}

async function mount(runtime: ReturnType<typeof createRuntime>) {
  document.body.innerHTML = videoAnchors();
  await mountBatchPageUi(runtime);
  // Let the async defaults (session, badges, recent batches) settle.
  await vi.waitFor(() => {
    if (runtime.callCount() === 0) {
      throw new Error("runtime not contacted");
    }
  });
}

afterEach(() => {
  cleanup();
  window.dispatchEvent(new Event("transcriptly-batch-unmount"));
  document.body.innerHTML = "";
});

describe("batch page panel", () => {
  it("disables the Cloud destination for signed-out users", async () => {
    const runtime = createRuntime({ session: { status: "signed-out" } });
    await mount(runtime);

    const cloud = document.querySelector<HTMLInputElement>(
      '[data-destination="cloud"]',
    );
    expect(cloud?.disabled).toBe(true);
    expect(cloud?.checked).toBe(false);
    const hint = document.querySelector("[data-cloud-label] .hint");
    expect(hint?.textContent).toContain("Sign in");
  });

  it("checks Cloud by default for signed-in users with the preference on", async () => {
    const runtime = createRuntime({
      session: { status: "signed-in", email: "user@example.com" },
      cloudPreference: true,
    });
    await mount(runtime);

    const cloud = document.querySelector<HTMLInputElement>(
      '[data-destination="cloud"]',
    );
    expect(cloud?.disabled).toBe(false);
    expect(cloud?.checked).toBe(true);
  });

  it("marks already-saved videos on their cards and in the status line", async () => {
    const runtime = createRuntime({
      saved: { abc12345678: { local: true, cloud: true } },
    });
    await mount(runtime);

    const card = document.querySelector(
      "ytd-rich-item-renderer",
    ) as HTMLElement;
    const badge = card.querySelector(".transcriptly-batch-badge");
    expect(badge?.textContent).toBe("Saved");

    const checkbox = card.querySelector<HTMLInputElement>(
      ".transcriptly-batch-checkbox",
    );
    expect(checkbox).not.toBeNull();
    if (checkbox) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await vi.waitFor(() => {
      const status = document.querySelector(".status");
      expect(status?.textContent).toContain("already saved");
    });
  });

  it("requires videos and a destination before starting", async () => {
    const runtime = createRuntime();
    await mount(runtime);

    const button = document.querySelector<HTMLButtonElement>(
      '[data-action="start"]',
    );
    button?.click();

    await vi.waitFor(() => {
      const status = document.querySelector(".status");
      expect(status?.textContent).toContain("Select videos");
    });
    expect(
      runtime.sent.some(
        (message) => (message as { type: string }).type === BATCH_START,
      ),
    ).toBe(false);
  });

  it("starts a batch with the checked videos and shows task progress", async () => {
    const runtime = createRuntime({
      session: { status: "signed-in", email: "user@example.com" },
      cloudPreference: false,
      tasks: [
        makeTask({
          state: "running",
          items: [
            makeTask().items[0] as BatchTask["items"][number],
            {
              ...(makeTask().items[1] as BatchTask["items"][number]),
              local: "running",
              cloud: "queued",
              localError: undefined,
            },
          ],
        }),
      ],
    });
    await mount(runtime);

    selectFirstVideo();
    clickStart();

    await vi.waitFor(() => {
      const summary = document.querySelector(".summary");
      expect(summary?.textContent).toContain("Running");
    });

    const start = runtime.sent.find(
      (
        message,
      ): message is {
        type: string;
        videos: unknown[];
        destinations: string[];
      } => (message as { type: string }).type === BATCH_START,
    );
    expect(start?.videos).toHaveLength(1);
    expect(start?.destinations).toEqual(["local"]);
    expect(runtime.sent).toContainEqual({
      type: BATCH_STATUS_REQUEST,
      taskId: "task-1",
    });
  });

  it("shows per-video results with failure reasons and a Retry button", async () => {
    const runtime = createRuntime({
      startStatus: { ok: true, taskId: "task-1" },
      tasks: [makeTask()],
    });
    await mount(runtime);

    selectFirstVideo();
    document.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();

    await vi.waitFor(() => {
      expect(document.querySelector(".summary")?.textContent).toContain(
        "Completed",
      );
    });
    const errors = [...document.querySelectorAll(".item-error")].map(
      (element) => element.textContent,
    );
    expect(errors).toContain("local: disk full");

    document.querySelector<HTMLButtonElement>('[data-action="retry"]')?.click();
    await vi.waitFor(() => {
      expect(runtime.sent).toContainEqual({
        type: BATCH_RETRY_ITEM,
        taskId: "task-1",
        videoId: "def12345678",
      });
    });
  });

  it("sends stop and pause from the task controls", async () => {
    const runtime = createRuntime({
      tasks: [
        makeTask({
          state: "running",
          items: [
            makeTask().items[0] as BatchTask["items"][number],
            {
              ...(makeTask().items[1] as BatchTask["items"][number]),
              local: "queued",
              cloud: "queued",
              localError: undefined,
            },
          ],
        }),
      ],
    });
    await mount(runtime);

    selectFirstVideo();
    document.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="pause"]')).not.toBeNull();
    });
    document.querySelector<HTMLButtonElement>('[data-action="pause"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-action="stop"]')?.click();

    await vi.waitFor(() => {
      const types = runtime.sent.map(
        (message) => (message as { type: string }).type,
      );
      expect(types).toContain(BATCH_PAUSE);
      expect(types).toContain(BATCH_STOP);
    });
  });

  it("returns to the selection view and lists recent batches", async () => {
    const runtime = createRuntime({
      tasks: [makeTask()],
    });
    await mount(runtime);

    selectFirstVideo();
    document.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();

    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="back"]')).not.toBeNull();
    });
    document.querySelector<HTMLButtonElement>('[data-action="back"]')?.click();

    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLButtonElement>('[data-action="start"]'),
      ).not.toBeNull();
    });
    expect(document.querySelector(".select-view")?.hasAttribute("hidden")).toBe(
      false,
    );
  });

  it("does not mount on non-batch pages", async () => {
    document.body.innerHTML = videoAnchors();
    await mountBatchPageUi({
      ...createRuntime(),
      pageUrl: "https://www.youtube.com/watch?v=abc12345678",
    });
    expect(document.getElementById("transcriptly-batch-panel")).toBeNull();
  });

  it("guides on a channel root page instead of scanning", async () => {
    document.body.innerHTML = "";
    await mountBatchPageUi({
      ...createRuntime(),
      pageUrl: "https://www.youtube.com/@eoglobal",
    });
    const guide = document.getElementById("transcriptly-batch-guide");
    expect(guide?.textContent).toContain("Videos tab");
    expect(document.getElementById("transcriptly-batch-panel")).toBeNull();
  });
});
