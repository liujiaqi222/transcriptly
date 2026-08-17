import { serializeToMarkdown } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";

const DATABASE_NAME = "transcriptly";
const DATABASE_VERSION = 1;
const DIRECTORY_STORE = "local-save";
const DIRECTORY_KEY = "directory";

interface WritableFile {
  write(content: string): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

interface LocalFileHandle {
  createWritable(options?: {
    keepExistingData?: boolean;
  }): Promise<WritableFile>;
}

export interface LocalDirectoryHandle {
  readonly name: string;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<LocalFileHandle>;
  removeEntry(name: string): Promise<void>;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
}

export interface DirectoryStore {
  get(): Promise<LocalDirectoryHandle | undefined>;
  set(directory: LocalDirectoryHandle): Promise<void>;
}

export interface LocalSaveResult {
  directoryName: string;
  filename: string;
}

export interface LocalMarkdownSaver {
  changeDirectory(): Promise<string>;
  getSavedDirectoryName(): Promise<string | undefined>;
  save(capture: Capture, filename?: string): Promise<LocalSaveResult>;
}

export interface LocalMarkdownSaverOptions {
  store?: DirectoryStore;
  pickDirectory?: () => Promise<LocalDirectoryHandle>;
  runExclusive?: <T>(action: () => Promise<T>) => Promise<T>;
}

export class LocalSaveError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LocalSaveError";
  }
}

export function slugifyFilename(value: string): string {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120)
      .replace(/-+$/g, "") || "untitled"
  );
}

export function suggestedMarkdownFilename(capture: Capture): string {
  const date = capture.capturedAt.slice(0, 10);
  return `${date} · ${slugifyFilename(capture.source.title)}.md`;
}

export function normalizeMarkdownFilename(filename: string): string {
  const withoutExtension = filename.trim().replace(/\.md$/i, "");
  const safeName = withoutExtension
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 180)
    .trim();

  if (!safeName || safeName === "." || safeName === "..") {
    throw new LocalSaveError("Enter a valid Markdown filename.");
  }
  return `${safeName}.md`;
}

export async function availableFilename(
  requestedFilename: string,
  exists: (filename: string) => Promise<boolean>,
): Promise<string> {
  const normalized = normalizeMarkdownFilename(requestedFilename);
  if (!(await exists(normalized))) return normalized;

  const stem = normalized.slice(0, -3);
  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidate = `${stem} (${suffix}).md`;
    if (!(await exists(candidate))) return candidate;
  }

  throw new LocalSaveError(
    `Could not find an available name for "${normalized}".`,
  );
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function openDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const operation = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    operation.onupgradeneeded = () => {
      if (!operation.result.objectStoreNames.contains(DIRECTORY_STORE)) {
        operation.result.createObjectStore(DIRECTORY_STORE);
      }
    };
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

export function createIndexedDbDirectoryStore(
  indexedDB: IDBFactory = globalThis.indexedDB,
): DirectoryStore {
  return {
    async get() {
      const database = await openDatabase(indexedDB);
      try {
        const transaction = database.transaction(DIRECTORY_STORE, "readonly");
        const complete = transactionComplete(transaction);
        const result = await request(
          transaction.objectStore(DIRECTORY_STORE).get(DIRECTORY_KEY),
        );
        await complete;
        return result as LocalDirectoryHandle | undefined;
      } finally {
        database.close();
      }
    },
    async set(directory) {
      const database = await openDatabase(indexedDB);
      try {
        const transaction = database.transaction(DIRECTORY_STORE, "readwrite");
        const complete = transactionComplete(transaction);
        await request(
          transaction
            .objectStore(DIRECTORY_STORE)
            .put(directory, DIRECTORY_KEY),
        );
        await complete;
      } finally {
        database.close();
      }
    },
  };
}

function defaultDirectoryPicker(): Promise<LocalDirectoryHandle> {
  const picker = (
    globalThis as typeof globalThis & {
      showDirectoryPicker?: (options?: {
        mode?: "read" | "readwrite";
      }) => Promise<LocalDirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (!picker) {
    throw new LocalSaveError(
      "Folder selection is unavailable in this browser. Use Chrome or Chromium.",
    );
  }
  return picker({ mode: "readwrite" });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runWithBrowserLock<T>(action: () => Promise<T>): Promise<T> {
  if (!globalThis.navigator?.locks) {
    throw new LocalSaveError(
      "Safe local saving is unavailable in this browser. Use Chrome or Chromium.",
    );
  }
  return globalThis.navigator.locks.request("transcriptly-local-save", action);
}

async function hasFile(
  directory: LocalDirectoryHandle,
  filename: string,
): Promise<boolean> {
  try {
    await directory.getFileHandle(filename);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return false;
    }
    throw error;
  }
}

async function ensureWritePermission(directory: LocalDirectoryHandle) {
  const options = { mode: "readwrite" as const };
  if ((await directory.queryPermission(options)) === "granted") return;
  if ((await directory.requestPermission(options)) !== "granted") {
    throw new LocalSaveError(
      `Write access to "${directory.name}" was not granted.`,
    );
  }
}

async function writeNewFile(
  directory: LocalDirectoryHandle,
  filename: string,
  content: string,
): Promise<void> {
  let writable: WritableFile | undefined;
  let created = false;
  try {
    const file = await directory.getFileHandle(filename, { create: true });
    created = true;
    writable = await file.createWritable({ keepExistingData: false });
    await writable.write(content);
    await writable.close();
  } catch (error) {
    try {
      await writable?.abort();
    } catch {
      // Cleanup continues by removing the newly-created directory entry.
    }

    let cleanupError: unknown;
    if (created) {
      try {
        await directory.removeEntry(filename);
      } catch (error) {
        cleanupError = error;
      }
    }

    const cleanupSuffix = cleanupError
      ? ` The incomplete file could not be removed: ${errorMessage(cleanupError)}`
      : "";
    throw new LocalSaveError(
      `Could not save "${filename}": ${errorMessage(error)}.${cleanupSuffix}`.replace(
        /\.\.$/,
        ".",
      ),
      { cause: error },
    );
  }
}

export async function createLocalMarkdownSaver(
  options: LocalMarkdownSaverOptions = {},
): Promise<LocalMarkdownSaver> {
  const store = options.store ?? createIndexedDbDirectoryStore();
  const pickDirectory = options.pickDirectory ?? defaultDirectoryPicker;
  const runExclusive = options.runExclusive ?? runWithBrowserLock;
  let savedDirectory: LocalDirectoryHandle | undefined;

  try {
    savedDirectory = await store.get();
  } catch (error) {
    throw new LocalSaveError(
      `Could not read the saved folder: ${errorMessage(error)}`,
      { cause: error },
    );
  }

  async function selectDirectory(): Promise<LocalDirectoryHandle> {
    try {
      const directory = await pickDirectory();
      await store.set(directory);
      savedDirectory = directory;
      return directory;
    } catch (error) {
      if (error instanceof LocalSaveError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new LocalSaveError("Folder selection was cancelled.", {
          cause: error,
        });
      }
      throw new LocalSaveError(
        `Could not select the save folder: ${errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  return {
    async changeDirectory() {
      return (await selectDirectory()).name;
    },
    async getSavedDirectoryName() {
      return savedDirectory?.name;
    },
    async save(capture, filename = suggestedMarkdownFilename(capture)) {
      let directory: LocalDirectoryHandle;
      try {
        directory = savedDirectory ?? (await selectDirectory());
        await ensureWritePermission(directory);
      } catch (error) {
        if (error instanceof LocalSaveError) throw error;
        throw new LocalSaveError(
          `Could not access the save folder: ${errorMessage(error)}`,
          { cause: error },
        );
      }

      return runExclusive(async () => {
        let safeFilename: string;
        try {
          safeFilename = await availableFilename(filename, (candidate) =>
            hasFile(directory, candidate),
          );
        } catch (error) {
          if (error instanceof LocalSaveError) throw error;
          throw new LocalSaveError(
            `Could not check filenames in "${directory.name}": ${errorMessage(error)}`,
            { cause: error },
          );
        }
        await writeNewFile(
          directory,
          safeFilename,
          serializeToMarkdown(capture),
        );
        return { directoryName: directory.name, filename: safeFilename };
      });
    },
  };
}
