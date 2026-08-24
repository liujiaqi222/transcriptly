// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BatchTask } from "../batch/jobs";
import {
  ManagerApp,
  type ManagerDependencies,
} from "../entrypoints/manager/app";
import type { ManagerLocalSaveHost } from "../entrypoints/manager/local-save-host";
import {
  BATCH_PAUSE,
  BATCH_RESUME,
  BATCH_RETRY_ITEM,
  BATCH_STATUS_REQUEST,
  BATCH_STOP,
  type BatchMutationStatus,
} from "../shared/messages";

function item(
  videoId: string,
  local: BatchTask["items"][number]["local"],
  cloud: BatchTask["items"][number]["cloud"],
  overrides: Partial<BatchTask["items"][number]> = {},
): BatchTask["items"][number] {
  return {
    video: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: `Video ${videoId}`,
    },
    local,
    cloud,
    ...overrides,
  };
}

function makeTask(overrides: Partial<BatchTask> = {}): BatchTask {
  return {
    id: "task-1",
    destinations: ["local", "cloud"],
    items: [
      item("abc12345678", "saved", "saved"),
      item("def12345678", "failed", "queued", {
        localError: "disk full",
      }),
      item("ghi12345678", "skipped", "skipped"),
      item("jkl12345678", "running", "running"),
    ],
    state: "running",
    createdAt: Date.parse("2026-08-22T00:00:00.000Z"),
    updatedAt: Date.parse("2026-08-22T00:00:01.000Z"),
    ...overrides,
  };
}

interface Harness {
  tasks: BatchTask[];
  sent: unknown[];
  respond<T>(message: unknown, result: T): void;
  deps: ManagerDependencies;
}

function createHarness(tasks: BatchTask[]): Harness {
  const sent: unknown[] = [];
  const handlers = new Map<unknown, unknown>();
  const sendMessage = vi.fn(async (message: unknown) => {
    sent.push(message);
    if ((message as { type: string }).type === BATCH_STATUS_REQUEST) {
      const taskId = (message as { taskId?: string }).taskId;
      return {
        tasks: taskId
          ? tasks.filter((task) => task.id === taskId)
          : tasks.slice(0, 10),
      };
    }
    const handler = handlers.get((message as { type: string }).type);
    return handler ?? { ok: true };
  });
  const deps: ManagerDependencies = {
    sendMessage: sendMessage as unknown as ManagerDependencies["sendMessage"],
  };
  return {
    tasks,
    sent,
    respond<T>(message: unknown, result: T) {
      handlers.set(message, result);
    },
    deps,
  };
}

async function renderManager(
  harness: ReturnType<typeof createHarness>,
  initialTaskId?: string,
  localSaveHost?: ManagerLocalSaveHost,
) {
  render(
    <ManagerApp
      deps={harness.deps}
      initialTaskId={initialTaskId}
      localSaveHost={localSaveHost}
    />,
  );
  await screen.findByText("Recent batches");
  return harness;
}

function createFakeHost(
  status: { directoryName?: string; writePermission: boolean } = {
    directoryName: "Vault",
    writePermission: false,
  },
) {
  const listeners = new Set<() => void>();
  let current = { ...status };
  const host: ManagerLocalSaveHost = {
    getStatus: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    grantAccess: vi.fn(async (): Promise<"granted"> => {
      current = { ...current, writePermission: true };
      for (const listener of listeners) listener();
      return "granted";
    }),
  };
  return host;
}

function mutationMessageTypes(sent: unknown[]): string[] {
  return sent
    .map((message) => (message as { type: string }).type)
    .filter((type) => type !== BATCH_STATUS_REQUEST);
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "/", "/");
  vi.restoreAllMocks();
});

describe("batch manager page (#58)", () => {
  it("shows progress, ETA, state and per-item results for the newest task", async () => {
    await renderManager(
      createHarness([
        makeTask({
          items: [
            item("abc12345678", "saved", "saved", {
              startedAt: 0,
              finishedAt: 20_000,
            }),
            item("def12345678", "failed", "queued", {
              localError: "disk full",
            }),
            item("ghi12345678", "running", "running"),
          ],
        }),
      ]),
    );

    // State chip in the detail view and the matching history row.
    expect(screen.getAllByText("Running").length).toBe(2);
    // 1 of 3 done, 1 failed; 2 pending x 20 s average = 40 s remaining.
    expect(
      screen.getByText("1/3 done · 1 failed · ~40 s remaining"),
    ).toBeTruthy();
    expect(screen.getByText("Video abc12345678")).toBeTruthy();
    // The title links to the video and the id is shown next to it (#59).
    const link = screen.getByRole("link", { name: "Video abc12345678" });
    expect(link.getAttribute("href")).toBe(
      "https://www.youtube.com/watch?v=abc12345678",
    );
    expect(screen.getByText("abc12345678")).toBeTruthy();
    expect(screen.getByText("local: saved")).toBeTruthy();
    expect(screen.getByText("local: disk full")).toBeTruthy();
    // The honest foreground hint (#58 AC).
    expect(
      screen.getByText(/Keep the browser window in the foreground/),
    ).toBeTruthy();
  });

  it("deep-links to a task older than the recent-history limit", async () => {
    const recent = Array.from({ length: 10 }, (_, index) =>
      makeTask({ id: `task-${index}`, createdAt: 20 - index }),
    );
    const old = makeTask({ id: "task-old", createdAt: 1 });
    const harness = createHarness([...recent, old]);

    await renderManager(harness, old.id);

    expect(screen.getAllByText("Video abc12345678").length).toBeGreaterThan(0);
    expect(harness.sent).toContainEqual({
      type: BATCH_STATUS_REQUEST,
      taskId: old.id,
    });
  });

  it("reports a missing deep-linked task while preserving history", async () => {
    await renderManager(
      createHarness([makeTask({ id: "task-1" })]),
      "task-gone",
    );

    expect(screen.getByText("That batch task no longer exists.")).toBeTruthy();
    expect(screen.getByText("Recent batches")).toBeTruthy();
  });

  it("sends pause, resume and stop from the controls", async () => {
    const harness = createHarness([makeTask()]);
    await renderManager(harness);

    screen.getByRole("button", { name: "Pause" }).click();
    expect(harness.sent).toContainEqual({
      type: BATCH_PAUSE,
      taskId: "task-1",
    });
    // While the task runs, only Pause and Stop are offered.
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();

    // The next poll shows the paused task - Resume takes over.
    cleanup();
    const paused = createHarness([makeTask({ state: "paused" })]);
    await renderManager(paused);
    screen.getByRole("button", { name: "Resume" }).click();
    screen.getByRole("button", { name: "Stop pending items" }).click();
    expect(paused.sent).toContainEqual({
      type: BATCH_RESUME,
      taskId: "task-1",
    });
    expect(paused.sent).toContainEqual({
      type: BATCH_STOP,
      taskId: "task-1",
    });
  });

  it("asks to continue after a browser-restart pause (#59)", async () => {
    const harness = createHarness([
      makeTask({ state: "paused", pauseReason: "browser-restart" }),
    ]);
    await renderManager(harness);

    expect(
      screen.getByText(
        "The browser restarted while this batch was running. Continue where it left off?",
      ),
    ).toBeTruthy();
    // The reason-specific action replaces the plain Resume.
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();

    screen.getByRole("button", { name: "Continue" }).click();
    expect(harness.sent).toContainEqual({
      type: BATCH_RESUME,
      taskId: "task-1",
    });
  });

  it("grants folder access and resumes in one gesture (#59)", async () => {
    const host = createFakeHost();
    const harness = createHarness([
      makeTask({ state: "paused", pauseReason: "local-permission" }),
    ]);
    await renderManager(harness, undefined, host);

    expect(
      screen.getByText(
        'Transcriptly needs write access to the folder "Vault" to continue saving locally.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();

    await screen
      .findByRole("button", { name: "Grant folder access & continue" })
      .then((button) => button.click());

    await waitFor(() => {
      expect(host.grantAccess).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(harness.sent).toContainEqual({
        type: BATCH_RESUME,
        taskId: "task-1",
      });
    });
  });

  it("offers folder selection when no folder is set (#59)", async () => {
    const host = createFakeHost({ writePermission: false });
    const harness = createHarness([
      makeTask({ state: "paused", pauseReason: "local-permission" }),
    ]);
    await renderManager(harness, undefined, host);

    expect(
      screen.getByText(
        "Transcriptly needs a save folder to continue saving locally.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Choose folder & continue" }),
    ).toBeTruthy();
  });

  it("hints at reopening the manager after the save host was lost (#59)", async () => {
    const harness = createHarness([
      makeTask({ state: "paused", pauseReason: "local-save-unavailable" }),
    ]);
    await renderManager(harness);

    expect(
      screen.getByText(
        "The manager page lost contact with the local save host. Reopen or refresh this page, check the target folder for a possibly written file, then continue.",
      ),
    ).toBeTruthy();
    screen.getByRole("button", { name: "Resume" }).click();
    expect(harness.sent).toContainEqual({
      type: BATCH_RESUME,
      taskId: "task-1",
    });
  });

  it("keeps the plain Resume for a user pause (#59)", async () => {
    const harness = createHarness([
      makeTask({ state: "paused", pauseReason: "user" }),
    ]);
    await renderManager(harness);

    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });

  it("sends a retry for one failed video", async () => {
    const harness = createHarness([
      makeTask({
        state: "completed",
        items: [
          item("abc12345678", "failed", "skipped", {
            localError: "disk full",
          }),
        ],
      }),
    ]);
    await renderManager(harness);

    screen.getByRole("button", { name: "Retry" }).click();

    expect(harness.sent).toContainEqual({
      type: BATCH_RETRY_ITEM,
      taskId: "task-1",
      videoId: "abc12345678",
    });
  });

  it("surfaces a refused mutation instead of failing silently", async () => {
    const harness = createHarness([makeTask()]);
    harness.respond<BatchMutationStatus>(BATCH_RETRY_ITEM, {
      ok: false,
      message: "Pause or stop the batch before retrying a video.",
    });
    await renderManager(harness);

    // Retry stays available while running (#58: executor semantics);
    // the refusal shows inline.
    const retries = screen.getAllByRole("button", { name: "Retry" });
    retries[0]?.click();

    expect(
      await screen.findByText(
        "Pause or stop the batch before retrying a video.",
      ),
    ).toBeTruthy();
    expect(mutationMessageTypes(harness.sent)).toContain(BATCH_RETRY_ITEM);
  });

  it("lists recent batches with failure counts and selects one", async () => {
    const harness = createHarness([
      makeTask({ id: "task-1", state: "completed" }),
      makeTask({
        id: "task-2",
        createdAt: 1,
        state: "completed",
        items: [
          item("abc12345678", "failed", "skipped", {
            localError: "boom",
          }),
          item("def12345678", "failed", "skipped"),
        ],
      }),
    ]);
    await renderManager(harness);

    const row = screen.getByRole("button", {
      name: /Completed.*2\/2 done · 2 failed/,
    });
    expect(
      screen.getByRole("button", { name: /Completed.*2\/4 done/ }),
    ).toBeTruthy();

    row.click();

    // Selecting a history row switches the detail view and the URL.
    expect(screen.getAllByText("Video abc12345678").length).toBeGreaterThan(0);
    expect(new URLSearchParams(location.search).get("task")).toBe("task-2");
  });

  it("shows an empty state when there are no batches", async () => {
    const harness = createHarness([]);
    render(<ManagerApp deps={harness.deps} />);
    expect(await screen.findByText(/No batches yet/)).toBeTruthy();
  });
});
