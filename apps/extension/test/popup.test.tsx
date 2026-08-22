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
import {
  Popup,
  type PopupDependencies,
  type PopupTab,
} from "../entrypoints/popup/app";
import { formatCapturedAt } from "../entrypoints/popup/utils";
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
    channelUrl: "https://www.youtube.com/@shipitweekly",
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
      getCloudPreference: vi.fn(async () => false),
      setCloudPreference: vi.fn(async () => undefined),
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
  return screen.getByRole("button", { name: "Save" });
}

describe("popup capture flow", () => {
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
      .getByText("Properties")
      .closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Properties"));
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

  it("directs channel pages to the batch panel but keeps the folder picker", async () => {
    const harness = createHarness({
      tab: { id: 3, url: "https://www.youtube.com/@eoglobal" },
    });
    render(<Popup deps={harness.deps} />);
    expect(
      await screen.findByText(
        /Select videos using the Transcriptly batch panel/,
      ),
    ).toBeTruthy();
    expect(harness.deps.requestCapture).not.toHaveBeenCalled();
    expect(screen.getByText(/Save to:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
  });

  it("warns on batch pages when folder access expired", async () => {
    const directory = new MemoryDirectory("Notes");
    directory.permission = "prompt";
    const harness = createHarness({
      tab: { id: 3, url: "https://www.youtube.com/playlist?list=PL1" },
      rememberedDirectory: directory,
    });
    render(<Popup deps={harness.deps} />);
    expect(await screen.findByText(/Write access is not active/)).toBeTruthy();
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
});

describe("popup cloud saving", () => {
  function cloudHarness(
    options: {
      session?: "signed-in" | "signed-out";
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
        ? { status: "signed-in" as const, email: "user@example.test" }
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

    const cloud = screen.getByLabelText("Cloud") as HTMLInputElement;
    expect(cloud.disabled).toBe(true);
    expect(cloud.checked).toBe(false);
    expect(screen.getByText("Sign in to save to cloud")).toBeTruthy();
  });

  it("forces the remembered preference back to off when signed out", async () => {
    const harness = cloudHarness({
      session: "signed-out",
      storedPreference: true,
    });
    await captureSuccessfulPopup(harness);

    const cloud = screen.getByLabelText("Cloud") as HTMLInputElement;
    expect(cloud.checked).toBe(false);
    expect(harness.deps.cloud.setCloudPreference).toHaveBeenCalledWith(false);
  });

  it("enables and persists the cloud preference for signed-in users", async () => {
    const harness = cloudHarness({ session: "signed-in" });
    await captureSuccessfulPopup(harness);

    const cloud = screen.getByLabelText("Cloud") as HTMLInputElement;
    expect(cloud.disabled).toBe(false);
    fireEvent.click(cloud);
    expect((screen.getByLabelText("Cloud") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(harness.deps.cloud.setCloudPreference).toHaveBeenCalledWith(true);
  });

  it("restores the remembered cloud preference for signed-in users", async () => {
    const harness = cloudHarness({
      session: "signed-in",
      storedPreference: true,
    });
    await captureSuccessfulPopup(harness);

    await waitFor(() => {
      expect((screen.getByLabelText("Cloud") as HTMLInputElement).checked).toBe(
        true,
      );
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
    fireEvent.click(screen.getByLabelText("Cloud"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Saved to Notes\//)).toBeTruthy();
    expect(order).toEqual(["enqueue", "local"]);
    expect(harness.deps.cloud.enqueueCloudSave).toHaveBeenCalledWith(capture);
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

  it("still saves locally when the cloud enqueue fails", async () => {
    const directory = new MemoryDirectory("Notes");
    const harness = cloudHarness({
      session: "signed-in",
      rememberedDirectory: directory,
    });
    harness.deps.cloud.enqueueCloudSave = vi.fn(async () => ({
      ok: false as const,
      message: "Could not queue the cloud save",
    }));

    await captureSuccessfulPopup(harness);
    fireEvent.click(screen.getByLabelText("Cloud"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/Saved to Notes\//)).toBeTruthy();
    expect(screen.getByText(/Could not queue the cloud save/)).toBeTruthy();
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
            libraryItemId: "item-1",
            outcome: "created",
            savedAt: "2026-08-21T10:00:00.000Z",
          },
        },
        failed: [],
      },
    });
    await captureSuccessfulPopup(harness);

    await waitFor(() =>
      expect(screen.getByText("Saved to cloud (created)")).toBeTruthy(),
    );
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
        screen.getByText(/Cloud save failed: The upload was interrupted/),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(harness.deps.cloud.retryCloudJob).toHaveBeenCalledWith("job-1"),
    );
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
        screen.getByRole("button", { name: "2 cloud saves failed" }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "2 cloud saves failed" }),
    );

    expect(screen.getByText("First failure")).toBeTruthy();
    expect(screen.getByText("Second failure")).toBeTruthy();

    // Auth failures offer retry only after signing in; permanent ones never.
    expect(screen.getByText("Sign in first")).toBeTruthy();
    const retries = screen.getAllByRole("button", { name: "Retry" });
    expect(retries).toHaveLength(1);
    expect((retries[0] as HTMLButtonElement).disabled).toBe(true);
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
    expect(screen.getByText("Save to:")).toBeTruthy();
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
