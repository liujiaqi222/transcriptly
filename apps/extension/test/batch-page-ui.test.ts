import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BatchTask } from "../batch/jobs";
import { BATCH_MAX_ITEMS } from "../batch/jobs";
import {
  type BatchPageRuntime,
  enterBatchSelectionMode,
} from "../batch/page-ui";
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

const CHANNEL_VIDEOS_PATH = "/@eoglobal/videos";

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

/** videoId at least 11 chars, unique per index. */
function videoIdFor(index: number): string {
  return `vid${String(index).padStart(8, "0")}`;
}

/** A feed with `count` selectable videos, in page order. */
function manyVideoAnchors(count: number): string {
  const cards = Array.from({ length: count }, (_, index) => {
    const videoId = videoIdFor(index);
    return `<ytd-rich-item-renderer><a href="https://www.youtube.com/watch?v=${videoId}" title="Video ${index}"><span id="video-title">Video ${index}</span></a></ytd-rich-item-renderer>`;
  });
  return `<div id="feed">${cards.join("")}</div>`;
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
  const managerTabs: string[] = [];
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
    managerTabs: string[];
    callCount(): number;
  } = {
    sendMessage: sendMessage as BatchPageRuntime["sendMessage"],
    getCloudPreference: async () => options.cloudPreference ?? false,
    openManagerTab: (taskId) => {
      managerTabs.push(taskId);
    },
    sent,
    managerTabs,
    callCount: () => sendMessage.mock.calls.length,
  };
  return runtime;
}

/** Simulate YouTube's in-page navigation signal (#56). */
function navigateTo(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event("yt-navigate-finish"));
}

function firstCheck(): HTMLElement {
  const check = document.querySelector<HTMLElement>(
    ".transcriptly-batch-check",
  );
  if (!check) throw new Error("missing batch checkbox hit area");
  return check;
}

function checkAt(index: number): HTMLElement {
  const checks = document.querySelectorAll<HTMLElement>(
    ".transcriptly-batch-check",
  );
  const check = checks.item(index);
  if (!check) throw new Error(`missing batch checkbox hit area #${index}`);
  return check;
}

function clickAction(action: string): void {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-action="${action}"]`,
  );
  if (!button) throw new Error(`missing ${action} button`);
  button.click();
}

function selectFirstVideo(): void {
  firstCheck().click();
}

function counterText(): string {
  const counter = document.querySelector(".counter");
  if (!counter?.textContent) throw new Error("missing counter");
  return counter.textContent;
}

function toastText(): string | null {
  return (
    document.querySelector("#transcriptly-batch-toast")?.textContent ?? null
  );
}

async function mount(
  runtime: ReturnType<typeof createRuntime>,
  html: string = videoAnchors(),
) {
  document.body.innerHTML = html;
  navigateTo(CHANNEL_VIDEOS_PATH);
  await enterBatchSelectionMode(runtime);
  // Let the async defaults (session, badges) settle.
  await vi.waitFor(() => {
    if (runtime.callCount() === 0) {
      throw new Error("runtime not contacted");
    }
  });
}

/** Teardown must leave zero residue on the page (#56). */
function expectZeroResidue(): void {
  expect(document.getElementById("transcriptly-batch-panel")).toBeNull();
  expect(document.getElementById("transcriptly-batch-panel-styles")).toBeNull();
  expect(document.getElementById("transcriptly-batch-toast")).toBeNull();
  expect(document.querySelector(".transcriptly-batch-check")).toBeNull();
  expect(document.querySelector(".transcriptly-batch-badge")).toBeNull();
  expect(document.querySelector("[data-transcriptly-batch]")).toBeNull();
}

afterEach(() => {
  cleanup();
  window.dispatchEvent(new Event("transcriptly-batch-unmount"));
  document.body.innerHTML = "";
  window.history.pushState({}, "", "/");
  vi.useRealTimers();
  vi.restoreAllMocks();
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
    const hint = document.querySelector("[data-cloud-hint]");
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

  it("marks already-saved videos on their cards and in the counter", async () => {
    const runtime = createRuntime({
      saved: { abc12345678: { local: true, cloud: true } },
    });
    await mount(runtime);

    const card = document.querySelector(
      "ytd-rich-item-renderer",
    ) as HTMLElement;
    const badge = card.querySelector(".transcriptly-batch-badge");
    expect(badge?.textContent).toBe("Saved");

    firstCheck().click();

    await vi.waitFor(() => {
      expect(counterText()).toContain("saved");
    });
    // The saved video occupies no quota (#57).
    expect(counterText()).toMatch(/^0\//);
  });

  it("requires videos and a destination before starting", async () => {
    const runtime = createRuntime();
    await mount(runtime);

    clickAction("start");

    expect(toastText()).toContain("Select videos");
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
    clickAction("start");

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

  it("opens the manager page tab for the new task alongside the task view (#57)", async () => {
    const runtime = createRuntime({
      startStatus: { ok: true, taskId: "task-1" },
      tasks: [makeTask()],
    });
    await mount(runtime);

    selectFirstVideo();
    clickAction("start");

    await vi.waitFor(() => {
      expect(runtime.managerTabs).toEqual(["task-1"]);
    });
    // The in-panel task view stays as the transitional monitor.
    expect(
      document.querySelector<HTMLElement>(".task-view")?.hasAttribute("hidden"),
    ).toBe(false);
  });

  it("shows per-video results with failure reasons and a Retry button", async () => {
    const runtime = createRuntime({
      startStatus: { ok: true, taskId: "task-1" },
      tasks: [makeTask()],
    });
    await mount(runtime);

    selectFirstVideo();
    clickAction("start");

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
    clickAction("start");

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

  it("returns to the selection view after a task", async () => {
    const runtime = createRuntime({
      tasks: [makeTask()],
    });
    await mount(runtime);

    selectFirstVideo();
    clickAction("start");

    await vi.waitFor(() => {
      expect(document.querySelector('[data-action="back"]')).not.toBeNull();
    });
    clickAction("back");

    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLButtonElement>('[data-action="start"]'),
      ).not.toBeNull();
    });
    expect(document.querySelector(".select-view")?.hasAttribute("hidden")).toBe(
      false,
    );
    // Recent batches were cut from the page overlay (#57).
    expect(document.querySelector(".recent")).toBeNull();
  });

  it("refuses to enter selection mode on non-batch pages", async () => {
    document.body.innerHTML = videoAnchors();
    navigateTo("/watch?v=abc12345678");
    const result = await enterBatchSelectionMode(createRuntime());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("playlist");
    }
    expect(document.getElementById("transcriptly-batch-panel")).toBeNull();
    expect(document.querySelector(".transcriptly-batch-check")).toBeNull();
  });

  it("refuses to enter selection mode on a channel root page", async () => {
    document.body.innerHTML = "";
    navigateTo("/@eoglobal");
    const result = await enterBatchSelectionMode(createRuntime());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Videos tab");
    }
    // The old guide overlay is gone: nothing is injected anywhere (#56).
    expect(document.getElementById("transcriptly-batch-guide")).toBeNull();
    expect(document.getElementById("transcriptly-batch-panel")).toBeNull();
  });
});

describe("selection toolbar (#57)", () => {
  it("shows a live counter with quota and ETA", async () => {
    const runtime = createRuntime();
    await mount(runtime);

    expect(counterText()).toBe(`0/${BATCH_MAX_ITEMS}`);
    firstCheck().click();
    expect(counterText()).toBe(`1/${BATCH_MAX_ITEMS} · ~1 min`);
  });

  it("Select all prefers unsaved videos, caps at 50 and toasts", async () => {
    // 3 saved videos (no quota) + 52 unsaved ones: only 50 can be picked.
    const saved: Record<string, { local: boolean; cloud: boolean }> = {};
    for (let index = 0; index < 3; index += 1) {
      saved[videoIdFor(index)] = { local: true, cloud: true };
    }
    const runtime = createRuntime({ saved });
    await mount(runtime, manyVideoAnchors(55));

    clickAction("select-all");

    await vi.waitFor(() => {
      expect(counterText()).toContain(`${BATCH_MAX_ITEMS}/${BATCH_MAX_ITEMS}`);
    });
    expect(toastText()).toContain(
      `Batch full (${BATCH_MAX_ITEMS}/${BATCH_MAX_ITEMS})`,
    );
    const checks = document.querySelectorAll<HTMLInputElement>(
      ".transcriptly-batch-check input",
    );
    expect([...checks].filter((input) => input.checked)).toHaveLength(
      BATCH_MAX_ITEMS + 3,
    );
    // The full counter turns red.
    expect(
      document.querySelector(".counter")?.classList.contains("counter-full"),
    ).toBe(true);
    // The two unsaved videos beyond the quota are greyed out.
    const disabled = [
      ...document.querySelectorAll(".transcriptly-batch-check"),
    ].filter((hit) => hit.classList.contains("is-disabled"));
    expect(disabled).toHaveLength(2);
  });

  it("greys out unchecked videos when the quota is full and restores them on uncheck", async () => {
    const runtime = createRuntime();
    await mount(runtime, manyVideoAnchors(BATCH_MAX_ITEMS + 1));

    clickAction("select-all");

    await vi.waitFor(() => {
      expect(counterText()).toContain(`${BATCH_MAX_ITEMS}/${BATCH_MAX_ITEMS}`);
    });
    const overflow = checkAt(BATCH_MAX_ITEMS);
    expect(overflow.classList.contains("is-disabled")).toBe(true);

    // Unchecking one immediately frees the quota (#57).
    checkAt(0).click();
    expect(counterText()).toContain(
      `${BATCH_MAX_ITEMS - 1}/${BATCH_MAX_ITEMS}`,
    );
    expect(overflow.classList.contains("is-disabled")).toBe(false);
    expect(
      document.querySelector(".counter")?.classList.contains("counter-full"),
    ).toBe(false);
  });

  it("clicking a greyed-out checkbox toasts instead of selecting", async () => {
    const runtime = createRuntime();
    await mount(runtime, manyVideoAnchors(BATCH_MAX_ITEMS + 1));

    clickAction("select-all");
    await vi.waitFor(() => {
      expect(counterText()).toContain(`${BATCH_MAX_ITEMS}/${BATCH_MAX_ITEMS}`);
    });
    const overflow = checkAt(BATCH_MAX_ITEMS);

    overflow.click();

    expect(toastText()).toContain(
      "Start this batch, then start another - batches run one after another.",
    );
    expect(overflow.querySelector("input")?.hasAttribute("checked")).toBe(
      false,
    );
    expect(counterText()).toContain(`${BATCH_MAX_ITEMS}/${BATCH_MAX_ITEMS}`);
  });

  it("Clear empties the selection", async () => {
    const runtime = createRuntime();
    await mount(runtime, manyVideoAnchors(3));

    clickAction("select-all");
    await vi.waitFor(() => {
      expect(counterText()).toContain("3/");
    });
    clickAction("clear");

    expect(counterText()).toBe(`0/${BATCH_MAX_ITEMS}`);
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          ".transcriptly-batch-check input",
        ),
      ].some((input) => input.checked),
    ).toBe(false);
  });

  it("a checkbox click never reaches the video card's navigation", async () => {
    const runtime = createRuntime();
    await mount(runtime);

    let navigated = false;
    document.getElementById("link-a")?.addEventListener("click", () => {
      navigated = true;
    });
    // YouTube navigates via delegated handlers on ancestors / document,
    // so verify the click never bubbles past the hit area.
    const cardHandler = vi.fn();
    document
      .querySelector("ytd-rich-item-renderer")
      ?.addEventListener("click", cardHandler);
    const documentHandler = vi.fn();
    document.addEventListener("click", documentHandler);

    firstCheck().click();
    firstCheck().click();

    expect(navigated).toBe(false);
    expect(cardHandler).not.toHaveBeenCalled();
    expect(documentHandler).not.toHaveBeenCalled();
  });
});

describe("toast (#57)", () => {
  it("auto-dismisses after 3 seconds, keeping only the latest message", async () => {
    const runtime = createRuntime();
    await mount(runtime);
    vi.useFakeTimers();

    clickAction("start");
    expect(toastText()).toContain("Select videos");
    clickAction("start");
    expect(toastText()).toContain("Select videos");
    expect(document.querySelectorAll("#transcriptly-batch-toast")).toHaveLength(
      1,
    );

    vi.advanceTimersByTime(3000);
    expect(document.getElementById("transcriptly-batch-toast")).toBeNull();
  });
});

describe("Load more (#57)", () => {
  it("auto-scrolls until the 10-second cap, then returns to idle", async () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const runtime = createRuntime();
    await mount(runtime, manyVideoAnchors(4));
    vi.useFakeTimers();

    clickAction("load-more");
    const loading = document.querySelector<HTMLButtonElement>(
      '[data-action="load-more"]',
    );
    if (!loading) throw new Error("missing load-more button");
    expect(loading.textContent).toContain("Loading…");
    expect(loading.textContent).toContain("4 videos");
    expect(loading.getAttribute("aria-busy")).toBe("true");

    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(400);
    expect(scrollBy).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10_000);
    expect(loading.textContent).toBe("Load more");
    expect(loading.getAttribute("aria-busy")).toBeNull();
  });

  it("stops after 100 discovered cards", async () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const runtime = createRuntime();
    await mount(runtime, manyVideoAnchors(4));
    vi.useFakeTimers();

    clickAction("load-more");

    // The feed lazily reveals more cards as it scrolls.
    const feed = document.getElementById("feed");
    if (!feed) throw new Error("missing feed");
    vi.advanceTimersByTime(400);
    feed.insertAdjacentHTML(
      "beforeend",
      manyVideoAnchors(100)
        .replace(/^<div id="feed">/, "")
        .replace(/<\/div>$/, ""),
    );
    // Let the mutation observer inject the new cards.
    await vi.advanceTimersByTimeAsync(0);

    vi.advanceTimersByTime(400);
    const loading = document.querySelector<HTMLButtonElement>(
      '[data-action="load-more"]',
    );
    if (!loading) throw new Error("missing load-more button");
    expect(loading.textContent).toBe("Load more");
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("a second click stops the load early", async () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const runtime = createRuntime();
    await mount(runtime, manyVideoAnchors(4));
    vi.useFakeTimers();

    clickAction("load-more");
    vi.advanceTimersByTime(400);
    clickAction("load-more");

    const loading = document.querySelector<HTMLButtonElement>(
      '[data-action="load-more"]',
    );
    if (!loading) throw new Error("missing load-more button");
    expect(loading.textContent).toBe("Load more");
    vi.advanceTimersByTime(10_000);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });
});

describe("selection mode lifecycle (#56)", () => {
  it("is idempotent while already active", async () => {
    const runtime = createRuntime();
    await mount(runtime);
    await enterBatchSelectionMode(runtime);

    expect(document.querySelectorAll("#transcriptly-batch-panel")).toHaveLength(
      1,
    );
    expect(document.querySelectorAll(".transcriptly-batch-check")).toHaveLength(
      2,
    );
  });

  it("tears down the panel, checkboxes, badges and styles on ✕", async () => {
    const runtime = createRuntime({
      saved: { abc12345678: { local: true, cloud: true } },
    });
    await mount(runtime);
    await vi.waitFor(() => {
      expect(
        document.querySelector(".transcriptly-batch-badge"),
      ).not.toBeNull();
    });

    clickAction("close");

    expectZeroResidue();
  });

  it("tears down on Escape", async () => {
    const runtime = createRuntime();
    await mount(runtime);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expectZeroResidue();
  });

  it("tears everything down when SPA navigation leaves the batch source", async () => {
    const runtime = createRuntime({
      saved: { abc12345678: { local: true, cloud: true } },
    });
    await mount(runtime);
    await vi.waitFor(() => {
      expect(
        document.querySelector(".transcriptly-batch-badge"),
      ).not.toBeNull();
    });

    navigateTo("/");

    expectZeroResidue();
  });

  it("keeps the panel across a watch-page visit and restores the selection on return", async () => {
    const runtime = createRuntime();
    await mount(runtime);
    selectFirstVideo();

    // The SPA replaces the feed while the user is on the watch page.
    const feed = document.getElementById("feed");
    if (!feed) throw new Error("missing feed");
    feed.innerHTML = "";
    navigateTo("/watch?v=abc12345678");
    expect(document.getElementById("transcriptly-batch-panel")).not.toBeNull();

    // Returning re-renders the feed; the observer re-injects the
    // checkboxes with the previous selection intact.
    navigateTo(CHANNEL_VIDEOS_PATH);
    feed.innerHTML = videoAnchors();
    await vi.waitFor(() => {
      const input = document.querySelector<HTMLInputElement>(
        ".transcriptly-batch-check input",
      );
      expect(input).not.toBeNull();
      expect(input?.checked).toBe(true);
    });
  });

  it("injects no new checkboxes while on a watch page", async () => {
    const runtime = createRuntime();
    await mount(runtime);
    navigateTo("/watch?v=abc12345678");

    const feed = document.getElementById("feed");
    if (!feed) throw new Error("missing feed");
    feed.insertAdjacentHTML(
      "beforeend",
      '<ytd-rich-item-renderer><a href="https://www.youtube.com/watch?v=ghi12345678" title="Third video"><span id="video-title">Third video</span></a></ytd-rich-item-renderer>',
    );
    // Let the observer's microtask run.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const cards = document.querySelectorAll("ytd-rich-item-renderer");
    expect(cards).toHaveLength(3);
    const thirdCard = cards.item(2);
    expect(thirdCard?.querySelector(".transcriptly-batch-check")).toBeNull();
  });

  it("re-enters with a fresh panel after teardown", async () => {
    const runtime = createRuntime();
    await mount(runtime);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expectZeroResidue();

    const result = await enterBatchSelectionMode(runtime);
    expect(result).toEqual({ ok: true });
    expect(document.getElementById("transcriptly-batch-panel")).not.toBeNull();
  });
});
