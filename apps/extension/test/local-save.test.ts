import type { Capture } from "@transcriptly/schema";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createIndexedDbDirectoryStore,
  createIndexedDbLocalReceiptStore,
  createLocalMarkdownSaver,
  type LocalDirectoryHandle,
  type LocalSaveError,
  suggestedMarkdownFilename,
} from "../local-save";

const capture: Capture = {
  source: {
    videoId: "abc123",
    url: "https://www.youtube.com/watch?v=abc123",
    title: "Build Agents: A Practical Guide!",
    channelName: "Ship It Weekly",
    channelUrl: "https://www.youtube.com/@shipitweekly",
    description: "Production lessons.",
  },
  capturedAt: "2026-08-15T10:30:00.000Z",
  segments: [{ start: 0, text: "Start here." }],
};

class MemoryDirectory {
  readonly kind = "directory" as const;
  files = new Map<string, string>();
  failRemove = false;
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
    if (this.failRemove) throw new Error("file is locked");
    this.files.delete(name);
  }

  async queryPermission() {
    return this.permission;
  }

  async requestPermission() {
    return this.permission;
  }
}

function createMemoryStore() {
  let saved: LocalDirectoryHandle | undefined;
  return {
    async get() {
      return saved;
    },
    async set(directory: LocalDirectoryHandle) {
      saved = directory;
    },
  };
}

function createExclusiveRunner() {
  let previous = Promise.resolve();
  return async <T>(action: () => Promise<T>): Promise<T> => {
    const result = previous.then(action, action);
    previous = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}

function createSaverOptions(
  directory: MemoryDirectory,
  store = createMemoryStore(),
) {
  return {
    store,
    pickDirectory: async () => directory,
    runExclusive: createExclusiveRunner(),
  };
}

describe("suggestedMarkdownFilename", () => {
  it("uses the capture date and a filesystem-safe title slug", () => {
    expect(suggestedMarkdownFilename(capture)).toBe(
      "2026-08-15 · build-agents-a-practical-guide.md",
    );
  });

  it("keeps CJK titles searchable", () => {
    expect(
      suggestedMarkdownFilename({
        ...capture,
        source: { ...capture.source, title: "如何构建 AI Agent？" },
      }),
    ).toBe("2026-08-15 · 如何构建-ai-agent.md");
  });
});

describe("local Markdown saving", () => {
  let indexedDB: IDBFactory;

  beforeEach(() => {
    indexedDB = new IDBFactory();
  });

  it("persists and filters local save receipts by directory", async () => {
    const receipts = createIndexedDbLocalReceiptStore(indexedDB);
    await receipts.put({
      videoId: "abc123",
      filename: "first.md",
      directoryName: "First",
      savedAt: "2026-08-15T10:30:00.000Z",
    });
    await receipts.put({
      videoId: "abc123",
      filename: "second.md",
      directoryName: "Second",
      savedAt: "2026-08-15T10:31:00.000Z",
    });

    await expect(receipts.getAll("First")).resolves.toEqual([
      expect.objectContaining({ filename: "first.md" }),
    ]);
    await expect(receipts.getAll()).resolves.toHaveLength(2);
  });

  it("persists the selected directory handle in IndexedDB", async () => {
    const directory = {
      name: "Transcript Vault",
    } as LocalDirectoryHandle;

    await createIndexedDbDirectoryStore(indexedDB).set(directory);

    await expect(
      createIndexedDbDirectoryStore(indexedDB).get(),
    ).resolves.toEqual(directory);
  });

  it("picks and remembers a directory on first save, then writes there without another prompt", async () => {
    const directory = new MemoryDirectory("Transcript Vault");
    const pickDirectory = vi.fn(async () => directory);
    const store = createMemoryStore();
    const receiptStore = createIndexedDbLocalReceiptStore(indexedDB);

    const runExclusive = createExclusiveRunner();
    const firstSaver = await createLocalMarkdownSaver({
      store,
      receiptStore,
      pickDirectory,
      runExclusive,
    });
    const first = await firstSaver.save(capture);
    const secondSaver = await createLocalMarkdownSaver({
      store,
      receiptStore,
      pickDirectory,
      runExclusive,
    });
    const second = await secondSaver.save(capture, "edited title.md");

    expect(pickDirectory).toHaveBeenCalledTimes(1);
    await expect(receiptStore.getAll("Transcript Vault")).resolves.toEqual([
      expect.objectContaining({
        videoId: "abc123",
        filename: "edited title.md",
        directoryName: "Transcript Vault",
      }),
    ]);
    expect(first).toEqual({
      directoryName: "Transcript Vault",
      filename: "2026-08-15 · build-agents-a-practical-guide.md",
    });
    expect(second.filename).toBe("edited title.md");
    expect(directory.files.get(first.filename)).toContain("# Build Agents");
    expect(directory.files.get(second.filename)).toContain("Start here.");
  });

  it("changes and persists the selected directory when requested", async () => {
    const original = new MemoryDirectory("Original");
    const replacement = new MemoryDirectory("Replacement");
    const pickDirectory = vi
      .fn<() => Promise<MemoryDirectory>>()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(replacement);
    const store = createMemoryStore();
    const runExclusive = createExclusiveRunner();
    const saver = await createLocalMarkdownSaver({
      store,
      pickDirectory,
      runExclusive,
    });

    await saver.save(capture);
    expect(await saver.changeDirectory()).toBe("Replacement");
    const freshSaver = await createLocalMarkdownSaver({
      store,
      pickDirectory,
      runExclusive,
    });
    const result = await freshSaver.save(capture);

    expect(pickDirectory).toHaveBeenCalledTimes(2);
    expect(result.directoryName).toBe("Replacement");
    expect(replacement.files.has(result.filename)).toBe(true);
  });

  it("adds a numeric suffix instead of overwriting an existing file", async () => {
    const directory = new MemoryDirectory("Vault");
    directory.files.set("notes.md", "original");
    directory.files.set("notes (2).md", "second");
    const saver = await createLocalMarkdownSaver(createSaverOptions(directory));

    const result = await saver.save(capture, "notes.md");

    expect(result.filename).toBe("notes (3).md");
    expect(directory.files.get("notes.md")).toBe("original");
    expect(directory.files.get("notes (2).md")).toBe("second");
    expect(directory.files.get("notes (3).md")).toContain("Start here.");
  });

  it("keeps a completed file when the local receipt cannot be written", async () => {
    const directory = new MemoryDirectory("Vault");
    const receiptStore = {
      getAll: vi.fn(async () => []),
      put: vi.fn(async () => {
        throw new Error("index unavailable");
      }),
    };
    const saver = await createLocalMarkdownSaver({
      ...createSaverOptions(directory),
      receiptStore,
    });

    await expect(saver.save(capture, "indexed.md")).resolves.toEqual({
      directoryName: "Vault",
      filename: "indexed.md",
      receiptError: "Could not update the local save index: index unavailable",
    });
    expect(directory.files.has("indexed.md")).toBe(true);
  });

  it("reports a clear error and removes a file created by a failed write", async () => {
    const directory = new MemoryDirectory("Vault");
    directory.failWrite = true;
    const saver = await createLocalMarkdownSaver(createSaverOptions(directory));

    await expect(saver.save(capture, "failed.md")).rejects.toEqual(
      expect.objectContaining<Partial<LocalSaveError>>({
        name: "LocalSaveError",
        message: 'Could not save "failed.md": disk full.',
      }),
    );
    expect(directory.files.has("failed.md")).toBe(false);
  });

  it("reports denied folder access without creating a file", async () => {
    const directory = new MemoryDirectory("Locked Vault");
    directory.permission = "denied";
    const saver = await createLocalMarkdownSaver(createSaverOptions(directory));

    await expect(saver.save(capture)).rejects.toThrow(
      'Write access to "Locked Vault" was not granted.',
    );
    expect(directory.files.size).toBe(0);
  });

  it("reports a cancelled first folder selection", async () => {
    const saver = await createLocalMarkdownSaver({
      store: createMemoryStore(),
      runExclusive: createExclusiveRunner(),
      pickDirectory: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    });

    await expect(saver.save(capture)).rejects.toThrow(
      "Folder selection was cancelled.",
    );
  });

  it("invokes the first-save picker before save yields the user activation", async () => {
    const directory = new MemoryDirectory("Vault");
    const pickDirectory = vi.fn(async () => directory);
    const saver = await createLocalMarkdownSaver({
      store: createMemoryStore(),
      pickDirectory,
      runExclusive: createExclusiveRunner(),
    });

    const saving = saver.save(capture);

    expect(pickDirectory).toHaveBeenCalledOnce();
    await saving;
  });

  it("reports when an incomplete file cannot be removed", async () => {
    const directory = new MemoryDirectory("Vault");
    directory.failWrite = true;
    directory.failRemove = true;
    const saver = await createLocalMarkdownSaver(createSaverOptions(directory));

    await expect(saver.save(capture, "failed.md")).rejects.toThrow(
      'Could not save "failed.md": disk full. The incomplete file could not be removed: file is locked',
    );
  });

  it("serializes concurrent saves so each receives a non-destructive name", async () => {
    const directory = new MemoryDirectory("Vault");
    const options = createSaverOptions(directory);
    const firstSaver = await createLocalMarkdownSaver(options);
    const secondSaver = await createLocalMarkdownSaver(options);

    const [first, second] = await Promise.all([
      firstSaver.save(capture, "notes.md"),
      secondSaver.save(capture, "notes.md"),
    ]);

    expect([first.filename, second.filename]).toEqual([
      "notes.md",
      "notes (2).md",
    ]);
    expect(directory.files.size).toBe(2);
  });
});
