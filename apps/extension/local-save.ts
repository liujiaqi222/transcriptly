import {
  type MarkdownFormat,
  serializeToMarkdown,
} from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";

const DATABASE_NAME = "transcriptly";
const DATABASE_VERSION = 2;
const DIRECTORY_STORE = "local-save";
const RECEIPT_STORE = "local-receipts";
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

export interface LocalSaveReceipt {
  videoId: string;
  filename: string;
  directoryName: string;
  savedAt: string;
}

export interface LocalReceiptStore {
  getAll(directoryName?: string): Promise<LocalSaveReceipt[]>;
  put(receipt: LocalSaveReceipt): Promise<void>;
}

export interface LocalSaveResult {
  directoryName: string;
  filename: string;
  /** The Markdown file exists, but the batch duplicate index could not update. */
  receiptError?: string;
}

export interface LocalMarkdownSaver {
  changeDirectory(): Promise<string>;
  getSavedDirectoryName(): Promise<string | undefined>;
  /** Whether a write needs no permission prompt (e.g. in a worker). */
  hasWritePermission(): Promise<boolean>;
  /**
   * Ask for write permission explicitly. Must run inside a user
   * gesture (the manager page's grant button, #59); resolves false
   * when there is no folder or the user denies.
   */
  requestWritePermission(): Promise<boolean>;
  save(
    capture: Capture,
    filename?: string,
    format?: MarkdownFormat,
  ): Promise<LocalSaveResult>;
}

export interface LocalMarkdownSaverOptions {
  store?: DirectoryStore;
  receiptStore?: LocalReceiptStore;
  pickDirectory?: () => Promise<LocalDirectoryHandle>;
  runExclusive?: <T>(action: () => Promise<T>) => Promise<T>;
  now?: () => number;
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
      const database = operation.result;
      if (!database.objectStoreNames.contains(DIRECTORY_STORE)) {
        database.createObjectStore(DIRECTORY_STORE);
      }
      if (!database.objectStoreNames.contains(RECEIPT_STORE)) {
        const store = database.createObjectStore(RECEIPT_STORE, {
          keyPath: ["directoryName", "videoId"],
        });
        store.createIndex("directoryName", "directoryName");
      }
    };
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

export function createIndexedDbLocalReceiptStore(
  indexedDB: IDBFactory = globalThis.indexedDB,
): LocalReceiptStore {
  return {
    async getAll(directoryName) {
      const database = await openDatabase(indexedDB);
      try {
        const transaction = database.transaction(RECEIPT_STORE, "readonly");
        const complete = transactionComplete(transaction);
        const records = (await request(
          directoryName === undefined
            ? transaction.objectStore(RECEIPT_STORE).getAll()
            : transaction
                .objectStore(RECEIPT_STORE)
                .index("directoryName")
                .getAll(directoryName),
        )) as LocalSaveReceipt[];
        await complete;
        return records;
      } finally {
        database.close();
      }
    },
    async put(receipt) {
      const database = await openDatabase(indexedDB);
      try {
        const transaction = database.transaction(RECEIPT_STORE, "readwrite");
        const complete = transactionComplete(transaction);
        await request(transaction.objectStore(RECEIPT_STORE).put(receipt));
        await complete;
      } finally {
        database.close();
      }
    },
  };
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
      `Write access to "${directory.name}" was not granted. Re-select the folder from the Transcriptly popup and retry.`,
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
  const receiptStore =
    options.receiptStore ?? createIndexedDbLocalReceiptStore();
  const pickDirectory = options.pickDirectory ?? defaultDirectoryPicker;
  const runExclusive = options.runExclusive ?? runWithBrowserLock;
  const now = options.now ?? (() => Date.now());
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
    async hasWritePermission() {
      if (!savedDirectory) return false;
      try {
        return (
          (await savedDirectory.queryPermission({ mode: "readwrite" })) ===
          "granted"
        );
      } catch {
        return false;
      }
    },
    async requestWritePermission() {
      if (!savedDirectory) return false;
      try {
        return (
          (await savedDirectory.requestPermission({ mode: "readwrite" })) ===
          "granted"
        );
      } catch {
        return false;
      }
    },
    async save(
      capture,
      filename = suggestedMarkdownFilename(capture),
      format = "timeline",
    ) {
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
          serializeToMarkdown(capture, format),
        );

        let receiptError: string | undefined;
        try {
          await receiptStore.put({
            videoId: capture.source.videoId,
            filename: safeFilename,
            directoryName: directory.name,
            savedAt: new Date(now()).toISOString(),
          });
        } catch (error) {
          // The file is already complete. Keep the successful local save and
          // surface the indexing problem without pretending the save failed.
          receiptError = `Could not update the local save index: ${errorMessage(error)}`;
        }
        return {
          directoryName: directory.name,
          filename: safeFilename,
          ...(receiptError ? { receiptError } : {}),
        };
      });
    },
  };
}
