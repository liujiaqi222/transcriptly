// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Capture } from "@transcriptly/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BatchTask } from "../batch/jobs";
import {
  Popup,
  type PopupDependencies,
  type PopupTab,
} from "../entrypoints/popup/app";
import { formatCapturedAt, watchPlaylistUrl } from "../entrypoints/popup/utils";
import {
  createLocalMarkdownSaver,
  type LocalDirectoryHandle,
  suggestedMarkdownFilename,
} from "../local-save";

const hostileTitle = `Bad <script>alert(1)</script> <img src=x onerror=alert(1)>`;

const capture: Capture = {
  source: {
    videoId: "abc123",
    url: "https://www.youtube.com/watch?v=abc123",
    title: hostileTitle,
    channelName: "Ship It Weekly",
    channelHandle: "/@shipitweekly",
    description: `Description with <b>markup</b> & <script>alert(3)</script>`,
  },
  capturedAt: "2026-08-15T10:30:00.000Z",
  chapters: [
    { start: 0, title: `Intro <script>alert(4)</script>` },
    { start: 62, title: "Part two" },
  ],
  segments: [
    { start: 0, text: "Start <script>alert(2)</script> here." },
    { start: 62, text: "Second segment." },
  ],
};

const youtubeTab: PopupTab = {
  id: 7,
  url: "https://www.youtube.com/watch?v=abc123",
};

class MemoryDirectory {
  files = new Map<string, string>();
  failWrite = false;
  permission: PermissionState = "granted";

  constructor(readonly name: string) {}

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) {
      if (!options?.create) throw new DOMException("Missing", "NotFoundError");
      this.files.set(name, "");
    }
    return {
      kind: "file" as const,
      name,
      createWritable: async () => ({
        write: async (content: string) => {
          if (this.failWrite) throw new Error("disk full");
          this.files.set(name, content);
        },
        close: async () => undefined,
        abort: async () => undefined,
      }),
    };
  }

  async removeEntry(name: string) {
    this.files.delete(name);
  }

  async queryPermission() {
    return this.permission;
  }

  async requestPermission() {
    return this.permission;
  }
}

function createMemoryStore(initial?: LocalDirectoryHandle) {
  let saved = initial;
  return {
    async get() {
      return saved;
    },
    async set(directory: LocalDirectoryHandle) {
      saved = directory;
    },
  };
}

async function runExclusive<T>(action: () => Promise<T>): Promise<T> {
  return action();
}

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface Harness {
  deps: PopupDependencies;
  picker: ReturnType<typeof vi.fn>;
  store: ReturnType<typeof createMemoryStore>;
}

function createHarness(
  options: {
    tab?: PopupTab | undefined;
    rememberedDirectory?: MemoryDirectory;
  } = {},
): Harness {
  const store = createMemoryStore(
    options.rememberedDirectory as LocalDirectoryHandle | undefined,
  );
  const picker = vi.fn(async () => {
    throw new DOMException("cancelled", "AbortError");
  });
  const deps: PopupDependencies = {
    getActiveTab: vi.fn(async () => options.tab),
    requestCapture: vi.fn(async () => ({ ok: true as const, capture })),
    enterBatchSelection: vi.fn(async () => ({ ok: true as const })),
    navigateTab: vi.fn(async () => undefined),
    getBatchStatus: vi.fn(async () => ({ tasks: [] })),
    openBatchManager: vi.fn(),
    resumeBatch: vi.fn(async () => ({ ok: true as const })),
    closePopup: vi.fn(),
    account: {
      getCloudSession: vi.fn(async () => ({ status: "signed-out" as const })),
      openCloudSignIn: vi.fn(async () => undefined),
      signOutCloud: vi.fn(async () => ({ status: "signed-out" as const })),
    },
    cloud: {
      enqueueCloudSave: vi.fn(async () => ({
        ok: true as const,
        jobId: "job-1",
      })),
      getCloudQueueStatus: vi.fn(async () => ({ failed: [] })),
      retryCloudJob: vi.fn(async () => ({ ok: true as const })),
      dismissCloudJob: vi.fn(async () => ({ ok: true as const })),
      getCloudPreference: vi.fn(async () => false),
      setCloudPreference: vi.fn(async () => undefined),
    },
    markdown: {
      getPreference: vi.fn(async () => "timeline" as const),
      setPreference: vi.fn(async () => undefined),
    },
    createSaver: () =>
      createLocalMarkdownSaver({
        store,
        pickDirectory: picker as unknown as () => Promise<LocalDirectoryHandle>,
        runExclusive,
      }),
  };
  return { deps, picker, store };
}

async function captureSuccessfulPopup(harness: Harness) {
  render(<Popup deps={harness.deps} />);
  await screen.findByLabelText("File name");
  fireEvent.click(screen.getByRole("button", { name: "Save options" }));
  return screen.getByRole("button", { name: "Save" });
}

describe("popup capture flow", () => {
  it("loads the remembered format, persists changes, and saves Article once", async () => {
    const directory = new MemoryDirectory("Notes");
    const harness = createHarness({
      tab: youtubeTab,
      rememberedDirectory: directory,
    });
    harness.deps.markdown.getPreference = vi.fn(async () => "article" as const);

    await captureSuccessfulPopup(harness);
    await waitFor(() => {
      expect(
        (screen.getByRole("radio", { name: "Article" }) as HTMLInputElement)
          .checked,
      ).toBe(true);
    });
    fireEvent.click(screen.getByRole("radio", { name: "Timeline" }));
    expect(harness.deps.markdown.setPreference).toHaveBeenCalledWith(
      "timeline",
    );
    fireEvent.click(screen.getByRole("radio", { name: "Article" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Saved to Notes\//)).toBeTruthy();
    expect(directory.files.size).toBe(1);
    expect([...directory.files.values()][0]).not.toContain("- [00:00](");
  });

  it("copies the selected transcript format from the icon-only action", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.requestCapture = vi.fn(async () => ({
      ok: true as const,
      capture: {
        ...capture,
        chapters: undefined,
        segments: [
          { start: 0, text: "First sentence." },
          { start: 2, text: "Second sentence." },
        ],
      },
    }));
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await captureSuccessfulPopup(harness);
    expect(screen.queryByText("Copy", { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Article" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Copy Article transcript" }),
    );

    expect(writeText).toHaveBeenCalledWith(
      "[00:00] First sentence. Second sentence.",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Transcript copied" }),
      ).toBeTruthy(),
    );
  });

  it("re-renders the preview body when the format switches", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.requestCapture = vi.fn(async () => ({
      ok: true as const,
      capture: {
        ...capture,
        chapters: undefined,
        segments: [
          { start: 0, text: "First sentence." },
          { start: 2, text: "Second sentence." },
        ],
      },
    }));

    await captureSuccessfulPopup(harness);
    // Timeline: one caption segment per row.
    const timelineSecond = screen.getByText("Second sentence.", {
      exact: false,
    });
    expect(timelineSecond.textContent).not.toContain("First sentence.");

    fireEvent.click(screen.getByRole("radio", { name: "Article" }));
    // Article: adjacent sentences reflow into a single paragraph.
    const articleFirst = screen.getByText("First sentence.", { exact: false });
    expect(articleFirst.textContent).toContain("Second sentence.");

    fireEvent.click(screen.getByRole("radio", { name: "Timeline" }));
    const timelineSecondAgain = screen.getByText("Second sentence.", {
      exact: false,
    });
    expect(timelineSecondAgain.textContent).not.toContain("First sentence.");
  });

  it("shows a loading state, then renders the captured preview as plain text", async () => {
    const pending = deferred<{ ok: true; capture: Capture }>();
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.requestCapture = () => pending.promise;

    const { container } = render(<Popup deps={harness.deps} />);
    expect(screen.getByText("Capturing transcript…")).toBeTruthy();

    pending.resolve({ ok: true, capture });
    const input = await screen.findByLabelText("File name");
    expect((input as HTMLInputElement).value).toBe(
      suggestedMarkdownFilename(capture),
    );

    expect(
      screen.getByText(/Start <script>alert\(2\)<\/script> here\./),
    ).toBeTruthy();
    expect(screen.getByText(/Second segment\./)).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: /Intro <script>alert\(4\)<\/script>/,
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Part two" })).toBeTruthy();
    expect(screen.getByText(/Description with <b>markup<\/b>/)).toBeTruthy();
    expect(container.querySelectorAll("script").length).toBe(0);

    const first = screen.getByRole("link", { name: "00:00" });
    expect(first.getAttribute("href")).toBe(
      "https://www.youtube.com/watch?v=abc123&t=0s",
    );
    const second = screen.getByRole("link", { name: "01:02" });
    expect(second.getAttribute("href")).toBe(
      "https://www.youtube.com/watch?v=abc123&t=62s",
    );
  });

  it("keeps capture destinations in a fixed shell below the scrolling content", async () => {
    const harness = createHarness({ tab: youtubeTab });
    const { container } = render(<Popup deps={harness.deps} />);
    await screen.findByLabelText("File name");

    const popup = container.querySelector(".popup");
    const content = popup?.querySelector(":scope > .popup-content");
    const footer = popup?.querySelector(":scope > .footer");
    expect(content).toBeTruthy();
    expect(footer).toBeTruthy();
    expect(content?.contains(footer ?? null)).toBe(false);
    const options = screen.getByRole("button", { name: "Save options" });
    expect(options.getAttribute("aria-expanded")).toBe("false");
    expect(footer?.querySelector('[aria-label="Local"]')).toBeNull();
    expect(
      footer?.querySelector('[aria-label="Contribute publicly"]'),
    ).toBeNull();

    fireEvent.click(options);
    expect(screen.queryByRole("button", { name: "Save options" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Save options" })).toBeTruthy();
    expect(footer?.querySelector('[aria-label="Local"]')).toBeTruthy();
    expect(
      footer?.querySelector('[aria-label="Sign in to contribute publicly"]'),
    ).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: "Timeline" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("keeps properties collapsed until expanded and formats display-only values", async () => {
    const harness = createHarness({ tab: youtubeTab });
    const capturedAt = "2026-08-17T14:51:43.413Z";
    harness.deps.requestCapture = vi.fn(async () => ({
      ok: true as const,
      capture: {
        ...capture,
        capturedAt,
        source: { ...capture.source, durationSeconds: 558 },
      },
    }));
    render(<Popup deps={harness.deps} />);
    await screen.findByLabelText("File name");

    const details = screen
      .getByText("Details")
      .closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Details"));
    expect(details.open).toBe(true);
    for (const [name, href] of [
      ["Ship It Weekly", "https://www.youtube.com/@shipitweekly"],
      ["abc123", "https://www.youtube.com/watch?v=abc123"],
    ]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.getAttribute("target")).toBe("_blank");
    }
    expect(screen.queryByText("Video", { exact: true })).toBeNull();
    expect(screen.getByText(hostileTitle)).toBeTruthy();
    expect(screen.getByText("09:18")).toBeTruthy();
    expect(screen.getByText(formatCapturedAt(capturedAt))).toBeTruthy();
    expect(screen.queryByText("558s")).toBeNull();
    expect(screen.queryByText(capturedAt)).toBeNull();
  });

  it("reports a missing active tab and can retry into success", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.getActiveTab = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(youtubeTab);

    render(<Popup deps={harness.deps} />);
    expect(await screen.findByText(/No active tab found/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByLabelText("File name");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("opens a channel's Videos tab from the channel-root hint", async () => {
    const harness = createHarness({
      tab: { id: 3, url: "https://www.youtube.com/@eoglobal" },
    });
    render(<Popup deps={harness.deps} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Open Videos tab" }),
    );
    await waitFor(() =>
      expect(harness.deps.navigateTab).toHaveBeenCalledWith(
        3,
        "https://www.youtube.com/@eoglobal/videos",
      ),
    );
    expect(harness.deps.closePopup).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Select videos/ })).toBeNull();
    expect(harness.deps.requestCapture).not.toHaveBeenCalled();
    expect(harness.deps.enterBatchSelection).not.toHaveBeenCalled();
  });

  it("keeps folder permission out of the batch selection entry", async () => {
    const directory = new MemoryDirectory("Notes");
    directory.permission = "prompt";
    const harness = createHarness({
      tab: { id: 3, url: "https://www.youtube.com/playlist?list=PL1" },
      rememberedDirectory: directory,
    });
    render(<Popup deps={harness.deps} />);
    await screen.findByRole("button", { name: "Select videos" });
    expect(screen.queryByText(/Write access is not active/)).toBeNull();
    expect(screen.queryByText(/Save to:/)).toBeNull();
  });

  it("enters selection mode on demand from a batch page and closes the popup", async () => {
    const harness = createHarness({
      tab: { id: 3, url: "https://www.youtube.com/playlist?list=PL1" },
    });
    const { container } = render(<Popup deps={harness.deps} />);

    await screen.findByRole("button", { name: "Select videos" });
    expect(
      container.querySelector(".popup-content.batch-content"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select videos" }));

    await waitFor(() =>
      expect(harness.deps.enterBatchSelection).toHaveBeenCalledWith(3),
    );
    await waitFor(() => expect(harness.deps.closePopup).toHaveBeenCalled());
    expect(harness.deps.requestCapture).not.toHaveBeenCalled();
  });

  it("shows the content script's refusal when entering selection mode fails", async () => {
    const harness = createHarness({
      tab: { id: 3, url: "https://www.youtube.com/playlist?list=PL1" },
    });
    harness.deps.enterBatchSelection = vi.fn(async () => ({
      ok: false as const,
      message: "Video selection is only available here.",
    }));
    render(<Popup deps={harness.deps} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Select videos" }),
    );

    expect(
      await screen.findByText("Video selection is only available here."),
    ).toBeTruthy();
    expect(harness.deps.closePopup).not.toHaveBeenCalled();
  });

  it("reports an unreachable content script when entering selection mode", async () => {
    const harness = createHarness({
      tab: { id: 3, url: "https://www.youtube.com/playlist?list=PL1" },
    });
    harness.deps.enterBatchSelection = vi.fn(async () => {
      throw new Error(
        "Could not establish connection. Receiving end does not exist.",
      );
    });
    render(<Popup deps={harness.deps} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Select videos" }),
    );

    expect(
      await screen.findByText(/Reload the YouTube page and try again/),
    ).toBeTruthy();
    expect(harness.deps.closePopup).not.toHaveBeenCalled();
  });

  it("reports non-YouTube tabs explicitly", async () => {
    const harness = createHarness({
      tab: { id: 3, url: "https://vimeo.com/12345" },
    });
    render(<Popup deps={harness.deps} />);
    expect(
      await screen.findByText(/Transcriptly works on YouTube watch pages/),
    ).toBeTruthy();
  });

  it("reports a missing content script explicitly", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.requestCapture = vi.fn(async () => {
      throw new Error(
        "Could not establish connection. Receiving end does not exist.",
      );
    });
    render(<Popup deps={harness.deps} />);
    expect(
      await screen.findByText(/Reload the YouTube page and try again/),
    ).toBeTruthy();
  });

  it("reports capture failures with their message", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.requestCapture = vi.fn(async () => ({
      ok: false as const,
      kind: "no-transcript" as const,
      message: "No transcript tracks were found.",
    }));
    render(<Popup deps={harness.deps} />);
    expect(
      await screen.findByText("No transcript tracks were found."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("reports captures whose transcript is empty", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.requestCapture = vi.fn(async () => ({
      ok: true as const,
      capture: { ...capture, segments: [] },
    }));
    render(<Popup deps={harness.deps} />);
    expect(
      await screen.findByText(/No transcript found on this video/),
    ).toBeTruthy();
  });

  it("keeps capturing normally on a watch page inside a playlist (#69)", async () => {
    const harness = createHarness({
      tab: {
        id: 7,
        url: "https://www.youtube.com/watch?v=abc123&list=PL123",
      },
    });
    await captureSuccessfulPopup(harness);
    expect(harness.deps.requestCapture).toHaveBeenCalledWith(7);
    expect(
      await screen.findByText(/This video is part of a playlist/),
    ).toBeTruthy();
  });

  it("opens the pure playlist page from the playlist hint (#69)", async () => {
    const harness = createHarness({
      tab: {
        id: 7,
        url: "https://www.youtube.com/watch?v=abc123&list=PL123&index=4",
      },
    });
    await captureSuccessfulPopup(harness);

    fireEvent.click(screen.getByRole("button", { name: "Open playlist page" }));

    await waitFor(() =>
      expect(harness.deps.navigateTab).toHaveBeenCalledWith(
        7,
        "https://www.youtube.com/playlist?list=PL123",
      ),
    );
    expect(harness.deps.closePopup).toHaveBeenCalled();
    expect(harness.deps.enterBatchSelection).not.toHaveBeenCalled();
  });

  it("shows an error and stays open when the playlist jump fails (#69)", async () => {
    const harness = createHarness({
      tab: {
        id: 7,
        url: "https://www.youtube.com/watch?v=abc123&list=PL123",
      },
    });
    harness.deps.navigateTab = vi.fn(async () => {
      throw new Error("tab is gone");
    });
    await captureSuccessfulPopup(harness);

    fireEvent.click(screen.getByRole("button", { name: "Open playlist page" }));

    expect(await screen.findByText(/Could not open the playlist/)).toBeTruthy();
    expect(harness.deps.closePopup).not.toHaveBeenCalled();
  });

  it("offers no playlist jump on a plain watch page (#69)", async () => {
    const harness = createHarness({ tab: youtubeTab });
    await captureSuccessfulPopup(harness);
    expect(screen.queryByText(/part of a playlist/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open playlist page" }),
    ).toBeNull();
  });
});

describe("watchPlaylistUrl (#69)", () => {
  it("maps a watch-in-playlist URL to its pure playlist page", () => {
    expect(
      watchPlaylistUrl(
        "https://www.youtube.com/watch?v=abc123&list=PL123&index=4",
      ),
    ).toBe("https://www.youtube.com/playlist?list=PL123");
    // Mobile watch pages land on the desktop playlist host, the only one
    // batch source detection accepts.
    expect(
      watchPlaylistUrl("https://m.youtube.com/watch?v=abc123&list=PL123"),
    ).toBe("https://www.youtube.com/playlist?list=PL123");
  });

  it("returns undefined without a usable list parameter", () => {
    expect(
      watchPlaylistUrl("https://www.youtube.com/watch?v=abc123"),
    ).toBeUndefined();
    expect(
      watchPlaylistUrl("https://www.youtube.com/watch?v=abc123&list="),
    ).toBeUndefined();
    expect(
      watchPlaylistUrl("https://www.youtube.com/playlist?list=PL123"),
    ).toBeUndefined();
    expect(watchPlaylistUrl("https://vimeo.com/12345")).toBeUndefined();
    expect(watchPlaylistUrl(undefined)).toBeUndefined();
  });
});

describe("popup batch manager entry (#58)", () => {
  function batchTask(overrides: Partial<BatchTask> = {}): BatchTask {
    return {
      id: "task-1",
      destinations: ["local"],
      items: [
        {
          video: {
            videoId: "abc12345678",
            url: "https://www.youtube.com/watch?v=abc12345678",
            title: "First video",
          },
          local: "saved",
          cloud: "skipped",
        },
        {
          video: {
            videoId: "def12345678",
            url: "https://www.youtube.com/watch?v=def12345678",
            title: "Second video",
          },
          local: "failed",
          cloud: "skipped",
        },
        {
          video: {
            videoId: "ghi12345678",
            url: "https://www.youtube.com/watch?v=ghi12345678",
            title: "Third video",
          },
          local: "running",
          cloud: "skipped",
        },
      ],
      state: "running",
      createdAt: Date.parse("2026-08-22T00:00:00.000Z"),
      updatedAt: Date.parse("2026-08-22T00:00:01.000Z"),
      ...overrides,
    };
  }

  it("shows live progress for a running batch and opens the manager page", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.getBatchStatus = vi.fn(async () => ({
      tasks: [batchTask()],
    }));
    render(<Popup deps={harness.deps} />);

    expect(
      await screen.findByText(
        "Batch capture in progress · 2/3 done · 1 failed",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open batch manager" }));
    expect(harness.deps.openBatchManager).toHaveBeenCalledWith("task-1");
  });

  it("keeps the entry for a paused batch, marked as waiting", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.getBatchStatus = vi.fn(async () => ({
      tasks: [
        batchTask({
          state: "paused",
          // Every pause path but a mid-item user pause re-queues or
          // settles its running items before pausing.
          items: batchTask().items.map((item) =>
            item.local === "running" ? { ...item, local: "queued" } : item,
          ),
        }),
      ],
    }));
    render(<Popup deps={harness.deps} />);

    expect(
      await screen.findByText(
        "Paused batch · 2/3 done · 1 failed - waiting to be resumed",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open batch manager" }),
    ).toBeTruthy();
  });

  it("says the current video is still finishing right after a user pause", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.getBatchStatus = vi.fn(async () => ({
      tasks: [batchTask({ state: "paused", pauseReason: "user" })],
    }));
    render(<Popup deps={harness.deps} />);

    expect(
      await screen.findByText(
        "Pausing - finishing the current video · 2/3 done · 1 failed",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open batch manager" }),
    ).toBeTruthy();
  });

  it("offers Continue after a browser-restart pause (#59)", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.getBatchStatus = vi.fn(async () => ({
      tasks: [batchTask({ state: "paused", pauseReason: "browser-restart" })],
    }));
    render(<Popup deps={harness.deps} />);

    expect(
      await screen.findByText(
        "The browser restarted and paused this batch · 2/3 done · 1 failed",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue batch" }));
    expect(harness.deps.resumeBatch).toHaveBeenCalledWith("task-1");

    fireEvent.click(screen.getByRole("button", { name: "Open batch manager" }));
    expect(harness.deps.openBatchManager).toHaveBeenCalledWith("task-1");
  });

  it("routes a permission pause to the manager with the folder name (#59)", async () => {
    const harness = createHarness({
      tab: youtubeTab,
      rememberedDirectory: new MemoryDirectory("Vault"),
    });
    harness.deps.getBatchStatus = vi.fn(async () => ({
      tasks: [batchTask({ state: "paused", pauseReason: "local-permission" })],
    }));
    render(<Popup deps={harness.deps} />);

    expect(
      await screen.findByText(
        'Paused - Transcriptly needs access to the folder "Vault" · 2/3 done · 1 failed',
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Grant access in manager" }),
    );
    expect(harness.deps.openBatchManager).toHaveBeenCalledWith("task-1");
  });

  it("explains a local-save-unavailable pause (#59)", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.getBatchStatus = vi.fn(async () => ({
      tasks: [
        batchTask({
          state: "paused",
          pauseReason: "local-save-unavailable",
        }),
      ],
    }));
    render(<Popup deps={harness.deps} />);

    expect(
      await screen.findByText(
        "Paused - the manager page lost contact with the local save host · 2/3 done · 1 failed",
      ),
    ).toBeTruthy();
  });

  it("hides the entry when every batch is finished", async () => {
    const harness = createHarness({ tab: youtubeTab });
    harness.deps.getBatchStatus = vi.fn(async () => ({
      tasks: [batchTask({ state: "completed" })],
    }));
    render(<Popup deps={harness.deps} />);

    await screen.findByLabelText("File name");
    expect(
      screen.queryByRole("button", { name: "Open batch manager" }),
    ).toBeNull();
  });
});

describe("popup cloud saving", () => {
  function cloudHarness(
    options: {
      session?: "signed-in" | "signed-out";
      publicProfileConfirmed?: boolean;
      storedPreference?: boolean;
      queueStatus?: import("../cloud/jobs").CloudQueueStatus;
      rememberedDirectory?: MemoryDirectory;
    } = {},
  ): Harness {
    const harness = createHarness({
      tab: youtubeTab,
      rememberedDirectory: options.rememberedDirectory,
    });
    harness.deps.account.getCloudSession = vi.fn(async () =>
      options.session === "signed-in"
        ? {
            status: "signed-in" as const,
            email: "user@example.test",
            displayName: "Test User",
            avatarUrl: null,
            publicContributionConfirmed:
              options.publicProfileConfirmed !== false,
          }
        : { status: "signed-out" as const },
    );
    harness.deps.cloud.getCloudPreference = vi.fn(
      async () => options.storedPreference === true,
    );
    harness.deps.cloud.getCloudQueueStatus = vi.fn(
      async () => options.queueStatus ?? { failed: [] },
    );
    return harness;
  }

  it("disables the cloud toggle and prompts sign-in when signed out", async () => {
    const harness = cloudHarness({ session: "signed-out" });
    await captureSuccessfulPopup(harness);

    expect(screen.queryByLabelText("Contribute publicly")).toBeNull();
    const signIn = await screen.findByRole("button", {
      name: "Sign in to contribute publicly",
    });
    expect(
      screen
        .queryByRole("button", {
          name: "Sign in to contribute publicly",
        })
        ?.closest(".popup-header"),
    ).toBeNull();
    fireEvent.click(signIn);
    await waitFor(() =>
      expect(harness.deps.account.openCloudSignIn).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByText("Waiting…")).toBeTruthy();
  });

  it("forces the remembered preference back to off when signed out", async () => {
    const harness = cloudHarness({
      session: "signed-out",
      storedPreference: true,
    });
    await captureSuccessfulPopup(harness);

    expect(screen.queryByLabelText("Contribute publicly")).toBeNull();
    expect(harness.deps.cloud.setCloudPreference).toHaveBeenCalledWith(false);
  });

  it("enables and persists the cloud preference for signed-in users", async () => {
    const harness = cloudHarness({ session: "signed-in" });
    await captureSuccessfulPopup(harness);

    const cloud = screen.getByLabelText(
      "Contribute publicly",
    ) as HTMLInputElement;
    expect(cloud.disabled).toBe(false);
    fireEvent.click(cloud);
    expect(
      (screen.getByLabelText("Contribute publicly") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(harness.deps.cloud.setCloudPreference).toHaveBeenCalledWith(true);
  });

  it("requires the public disclosure once before enqueueing a contribution", async () => {
    const directory = new MemoryDirectory("Notes");
    const harness = cloudHarness({
      session: "signed-in",
      publicProfileConfirmed: false,
      rememberedDirectory: directory,
    });
    await captureSuccessfulPopup(harness);

    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    expect(
      screen.getByText(/this transcript, your display name \(Test User\)/),
    ).toBeTruthy();

    // The combined save stays disabled until the disclosure is accepted,
    // so no enqueue can slip through unconfirmed.
    const saveButton = screen.getByRole("button", {
      name: "Save",
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(harness.deps.cloud.enqueueCloudSave).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByLabelText("I understand this contribution will be public"),
    );
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);
    await waitFor(() =>
      expect(harness.deps.cloud.enqueueCloudSave).toHaveBeenCalledWith(
        capture,
        { confirmPublicProfile: true },
      ),
    );
  });

  it("drops the accepted disclosure when Contribute publicly is toggled off", async () => {
    const harness = cloudHarness({
      session: "signed-in",
      publicProfileConfirmed: false,
    });
    await captureSuccessfulPopup(harness);

    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    fireEvent.click(
      screen.getByLabelText("I understand this contribution will be public"),
    );
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByLabelText(
          "I understand this contribution will be public",
        ) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("restores the remembered cloud preference for signed-in users", async () => {
    const harness = cloudHarness({
      session: "signed-in",
      storedPreference: true,
    });
    await captureSuccessfulPopup(harness);

    await waitFor(() => {
      expect(
        (screen.getByLabelText("Contribute publicly") as HTMLInputElement)
          .checked,
      ).toBe(true);
    });
    expect(harness.deps.cloud.getCloudPreference).toHaveBeenCalled();
  });

  it("queues the cloud job before saving locally", async () => {
    const directory = new MemoryDirectory("Notes");
    const order: string[] = [];
    const harness = cloudHarness({
      session: "signed-in",
      rememberedDirectory: directory,
    });
    harness.deps.cloud.enqueueCloudSave = vi.fn(async () => {
      order.push("enqueue");
      return { ok: true as const, jobId: "job-1" };
    });
    harness.deps.createSaver = async () => {
      const saver = await createLocalMarkdownSaver({
        store: createMemoryStore(directory),
        runExclusive,
      });
      return {
        ...saver,
        save: async (capture, filename) => {
          order.push("local");
          return saver.save(capture, filename);
        },
      };
    };

    await captureSuccessfulPopup(harness);
    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Saved to Notes\//)).toBeTruthy();
    expect(order).toEqual(["enqueue", "local"]);
    expect(harness.deps.cloud.enqueueCloudSave).toHaveBeenCalledWith(
      capture,
      undefined,
    );
  });

  it("saves locally without enqueueing cloud when Cloud is left off", async () => {
    const directory = new MemoryDirectory("Notes");
    const harness = cloudHarness({
      session: "signed-in",
      rememberedDirectory: directory,
    });

    await captureSuccessfulPopup(harness);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Saved to Notes\//)).toBeTruthy();
    expect(harness.deps.cloud.enqueueCloudSave).not.toHaveBeenCalled();
  });

  it("contributes publicly without a local save when Local is off", async () => {
    const harness = cloudHarness({ session: "signed-in" });
    await captureSuccessfulPopup(harness);

    fireEvent.click(screen.getByLabelText("Local"));
    expect(screen.queryByRole("radio", { name: "Timeline" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Article" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(harness.deps.cloud.enqueueCloudSave).toHaveBeenCalledWith(
        capture,
        undefined,
      ),
    );
    // No remembered directory exists in this harness, so a local save
    // attempt would open the folder picker and fail - it must not run.
    expect(screen.queryByText(/Saved to /)).toBeNull();
  });

  it("keeps Save enabled without a folder only when a destination is selected", async () => {
    const harness = cloudHarness({ session: "signed-in" });
    await captureSuccessfulPopup(harness);

    // Local off and public off: nothing to save to.
    fireEvent.click(screen.getByLabelText("Local"));
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    // Public alone is a complete destination even without a local saver.
    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("still saves locally when the cloud enqueue fails", async () => {
    const directory = new MemoryDirectory("Notes");
    const harness = cloudHarness({
      session: "signed-in",
      rememberedDirectory: directory,
    });
    harness.deps.cloud.enqueueCloudSave = vi.fn(async () => ({
      ok: false as const,
      message: "Could not queue the public contribution",
    }));

    await captureSuccessfulPopup(harness);
    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Saved to Notes\//)).toBeTruthy();
    expect(
      screen.getByText(/Could not queue the public contribution/),
    ).toBeTruthy();
  });

  it("clears a popup-local cloud error when Public is turned off", async () => {
    const directory = new MemoryDirectory("Notes");
    const harness = cloudHarness({
      session: "signed-in",
      rememberedDirectory: directory,
    });
    harness.deps.cloud.enqueueCloudSave = vi.fn(async () => ({
      ok: false as const,
      message: "Could not queue the public contribution",
    }));

    await captureSuccessfulPopup(harness);
    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Could not queue the public contribution/);

    fireEvent.click(screen.getByRole("button", { name: "Save options" }));
    fireEvent.click(screen.getByLabelText("Contribute publicly"));

    expect(
      screen.queryByText(/Could not queue the public contribution/),
    ).toBeNull();
  });

  it("clears the previous popup-local cloud error when Save is retried", async () => {
    const directory = new MemoryDirectory("Notes");
    const secondEnqueue = deferred<{
      ok: true;
      jobId: string;
    }>();
    const harness = cloudHarness({
      session: "signed-in",
      rememberedDirectory: directory,
    });
    harness.deps.cloud.enqueueCloudSave = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        message: "Could not queue the public contribution",
      })
      .mockReturnValueOnce(secondEnqueue.promise);

    await captureSuccessfulPopup(harness);
    fireEvent.click(screen.getByLabelText("Contribute publicly"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Could not queue the public contribution/);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        screen.queryByText(/Could not queue the public contribution/),
      ).toBeNull(),
    );

    secondEnqueue.resolve({ ok: true, jobId: "job-2" });
    await screen.findByText(/Saved to Notes\//);
  });

  it("shows the current video's saved receipt from the queueStatus", async () => {
    const harness = cloudHarness({
      session: "signed-in",
      queueStatus: {
        current: {
          id: "job-1",
          videoId: "abc123",
          title: "Ship It",
          state: "saved",
          receipt: {
            videoId: "abc123",
            contributionId: "contribution-1",
            outcome: "published",
            contributedAt: "2026-08-21T10:00:00.000Z",
          },
        },
        failed: [],
      },
    });
    await captureSuccessfulPopup(harness);

    await waitFor(() =>
      expect(screen.getByText("Contributed (published)")).toBeTruthy(),
    );
    const viewTranscript = screen.getByRole("link", {
      name: "View transcript",
    });
    expect(viewTranscript.getAttribute("href")).toBe(
      "http://localhost:3000/transcripts/abc123",
    );
    expect(viewTranscript.getAttribute("target")).toBe("_blank");
  });

  it("shows a failed cloud save with a retry that reaches the background", async () => {
    const harness = cloudHarness({
      session: "signed-in",
      queueStatus: {
        current: {
          id: "job-1",
          videoId: "abc123",
          title: "Ship It",
          state: "failed",
          failure: {
            kind: "retryable",
            code: "interrupted",
            message: "The upload was interrupted.",
          },
        },
        failed: [],
      },
    });
    await captureSuccessfulPopup(harness);

    await waitFor(() =>
      expect(
        screen.getByText(
          /Public contribution failed: The upload was interrupted/,
        ),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(harness.deps.cloud.retryCloudJob).toHaveBeenCalledWith("job-1"),
    );
  });

  it("keeps the current video's failure out of the global failure badge", async () => {
    const currentFailure = {
      id: "job-current",
      videoId: "abc123",
      title: "Current failure",
      state: "failed" as const,
      failure: {
        kind: "retryable" as const,
        code: "interrupted",
        message: "The current upload was interrupted.",
      },
    };
    const harness = cloudHarness({
      session: "signed-in",
      queueStatus: {
        current: currentFailure,
        failed: [
          currentFailure,
          {
            id: "job-other",
            videoId: "bbbbbbbbbbb",
            title: "Other failure",
            state: "failed",
            failure: {
              kind: "permanent",
              code: "capture_invalid",
              message: "Invalid.",
            },
          },
        ],
      },
    });
    await captureSuccessfulPopup(harness);

    await screen.findByText(
      /Public contribution failed: The current upload was interrupted/,
    );
    expect(
      screen.queryByRole("button", {
        name: "2 public contributions failed",
      }),
    ).toBeNull();
    const badge = screen.getByRole("button", {
      name: "1 public contribution failed",
    });
    fireEvent.click(badge);
    expect(screen.getByText("Other failure")).toBeTruthy();
    expect(screen.queryByText("Current failure")).toBeNull();
  });

  it("lists failed cloud saves behind a badge with retries", async () => {
    const harness = cloudHarness({
      session: "signed-out",
      queueStatus: {
        failed: [
          {
            id: "job-1",
            videoId: "aaaaaaaaaaa",
            title: "First failure",
            state: "failed",
            failure: {
              kind: "auth",
              code: "unauthenticated",
              message: "Sign in again.",
            },
          },
          {
            id: "job-2",
            videoId: "bbbbbbbbbbb",
            title: "Second failure",
            state: "failed",
            failure: {
              kind: "permanent",
              code: "capture_invalid",
              message: "Invalid.",
            },
          },
        ],
      },
    });
    await captureSuccessfulPopup(harness);

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "2 public contributions failed",
        }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "2 public contributions failed" }),
    );

    expect(screen.getByText("First failure")).toBeTruthy();
    expect(screen.getByText("Second failure")).toBeTruthy();

    // Auth failures offer retry only after signing in; permanent ones never.
    expect(screen.getByText("Sign in first")).toBeTruthy();
    const retries = screen.getAllByRole("button", { name: "Retry" });
    expect(retries).toHaveLength(1);
    expect((retries[0] as HTMLButtonElement).disabled).toBe(true);

    // Every row also offers Dismiss (#108), and the title tooltip explains
    // why the upload failed so Retry vs Dismiss is an informed choice.
    expect(screen.getByTitle("First failure - Sign in again.")).toBeTruthy();
    expect(screen.getByTitle("Second failure - Invalid.")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Dismiss failed contribution: First failure",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Dismiss failed contribution: Second failure",
      }),
    ).toBeTruthy();
  });

  it("dismisses a failed save and drops it from the badge (#108)", async () => {
    const harness = cloudHarness({
      session: "signed-in",
      queueStatus: {
        failed: [
          {
            id: "job-1",
            videoId: "aaaaaaaaaaa",
            title: "First failure",
            state: "failed",
            failure: {
              kind: "retryable",
              code: "interrupted",
              message: "The upload was interrupted.",
            },
          },
          {
            id: "job-2",
            videoId: "bbbbbbbbbbb",
            title: "Second failure",
            state: "failed",
            failure: {
              kind: "retryable",
              code: "interrupted",
              message: "The upload was interrupted.",
            },
          },
        ],
      },
    });
    await captureSuccessfulPopup(harness);

    const badge = await screen.findByRole("button", {
      name: "2 public contributions failed",
    });
    fireEvent.click(badge);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss failed contribution: First failure",
      }),
    );
    await waitFor(() =>
      expect(harness.deps.cloud.dismissCloudJob).toHaveBeenCalledWith("job-1"),
    );
  });

  it("hides the badge once every failure is dismissed (#108)", async () => {
    const harness = cloudHarness({
      session: "signed-in",
      queueStatus: {
        failed: [
          {
            id: "job-1",
            videoId: "aaaaaaaaaaa",
            title: "First failure",
            state: "failed",
            failure: {
              kind: "retryable",
              code: "interrupted",
              message: "The upload was interrupted.",
            },
          },
        ],
      },
    });
    await captureSuccessfulPopup(harness);

    const badge = await screen.findByRole("button", {
      name: "1 public contribution failed",
    });
    fireEvent.click(badge);

    // The next poll sees the emptied queue after the dismiss reached the
    // background store, so the badge disappears without a reopen.
    harness.deps.cloud.getCloudQueueStatus = vi.fn(async () => ({
      failed: [],
    }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss failed contribution: First failure",
      }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/public contributions? failed/)).toBeNull(),
    );
  });
});

describe("popup local saving", () => {
  it("opens the folder picker on first save and shows the saved file", async () => {
    const directory = new MemoryDirectory("Notes");
    const harness = createHarness({ tab: youtubeTab });
    harness.picker.mockImplementation(async () => directory);

    const save = await captureSuccessfulPopup(harness);
    fireEvent.click(save);

    expect(await screen.findByText(/Saved to Notes\//)).toBeTruthy();
    expect(
      screen.getByText(new RegExp(suggestedMarkdownFilename(capture))),
    ).toBeTruthy();
    expect(harness.picker).toHaveBeenCalledTimes(1);
    expect(directory.files.get(suggestedMarkdownFilename(capture))).toContain(
      "# Bad &lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("saves without opening the picker once a folder is remembered", async () => {
    const directory = new MemoryDirectory("Notes");
    const harness = createHarness({
      tab: youtubeTab,
      rememberedDirectory: directory,
    });

    await waitFor(async () => {
      expect(await harness.store.get()).toBe(directory);
    });
    const save = await captureSuccessfulPopup(harness);
    expect(screen.getByText("Folder")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();

    fireEvent.click(save);
    await screen.findByText(/Saved to Notes\//);
    expect(harness.picker).not.toHaveBeenCalled();
    expect(directory.files.has(suggestedMarkdownFilename(capture))).toBe(true);
  });

  it("updates the displayed folder on Change and saves to the new folder", async () => {
    const oldDirectory = new MemoryDirectory("Notes");
    const newDirectory = new MemoryDirectory("Archive");
    const harness = createHarness({
      tab: youtubeTab,
      rememberedDirectory: oldDirectory,
    });
    harness.picker.mockImplementation(async () => newDirectory);

    await captureSuccessfulPopup(harness);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    await screen.findByText("Archive");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/Saved to Archive\//);
    expect(newDirectory.files.has(suggestedMarkdownFilename(capture))).toBe(
      true,
    );
    expect(oldDirectory.files.size).toBe(0);
  });

  it("shows the suffixed filename when a file with the same name exists", async () => {
    const suggested = suggestedMarkdownFilename(capture);
    const directory = new MemoryDirectory("Notes");
    directory.files.set(suggested, "previous content");
    const harness = createHarness({
      tab: youtubeTab,
      rememberedDirectory: directory,
    });

    const save = await captureSuccessfulPopup(harness);
    fireEvent.click(save);

    const suffix = `${suggested.slice(0, -3)} (2).md`;
    expect(await screen.findByText(`Saved to Notes/${suffix}`)).toBeTruthy();
    expect(directory.files.get(suggested)).toBe("previous content");
    expect((screen.getByLabelText("File name") as HTMLInputElement).value).toBe(
      suffix,
    );
  });

  it("shows cancelled folder selection as an error, not success", async () => {
    const harness = createHarness({ tab: youtubeTab });
    const save = await captureSuccessfulPopup(harness);
    fireEvent.click(save);

    expect(
      await screen.findByText(/Folder selection was cancelled/),
    ).toBeTruthy();
    expect(screen.queryByText(/Saved to/)).toBeFalsy();
  });

  it("shows denied write permission as an error, not success", async () => {
    const directory = new MemoryDirectory("Notes");
    directory.permission = "denied";
    const harness = createHarness({
      tab: youtubeTab,
      rememberedDirectory: directory,
    });

    const save = await captureSuccessfulPopup(harness);
    fireEvent.click(save);

    expect(
      await screen.findByText(/Write access to "Notes" was not granted/),
    ).toBeTruthy();
    expect(screen.queryByText(/Saved to/)).toBeFalsy();
  });

  it("shows failed writes as an error and keeps the old file", async () => {
    const directory = new MemoryDirectory("Notes");
    directory.failWrite = true;
    const harness = createHarness({
      tab: youtubeTab,
      rememberedDirectory: directory,
    });

    const save = await captureSuccessfulPopup(harness);
    fireEvent.click(save);

    expect(await screen.findByText(/Could not save/)).toBeTruthy();
    expect(screen.queryByText(/Saved to/)).toBeFalsy();
    expect(directory.files.size).toBe(0);
  });
});
