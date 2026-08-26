import type { CloudReceipt } from "@/cloud/jobs";
import type { LocalSaveReceipt, LocalSaveResult } from "@/local-save";

/**
 * A batch processes at most this many videos that still need saving.
 * Already-saved videos ride along as `skipped` and never count against
 * the limit: `create` counts runnable videos, not the selection size -
 * do not "fix" it into a plain `videos.length` check.
 */
export const BATCH_MAX_RUNNABLE_ITEMS = 50;
const DATABASE_NAME = "transcriptly-batch";
const DATABASE_VERSION = 1;
const TASK_STORE = "tasks";

export type BatchDestination = "local" | "cloud";
export type BatchItemState =
  | "queued"
  | "running"
  | "saved"
  | "failed"
  | "skipped"
  | "cancelled";

/**
 * Why a batch is paused (#59). Persisted with the task so the manager and
 * popup can show the matching action (continue / grant / reopen) instead
 * of guessing from error text. Records written before #59 carry no
 * reason and render as a plain user pause.
 */
export type BatchPauseReason =
  | "user"
  | "browser-restart"
  | "local-permission"
  | "local-save-unavailable";

/** Result of asking the Manager Local Save Host for permission (#59). */
export type LocalPreflightOutcome =
  | { status: "ok"; directoryName: string }
  | { status: "permission-required" }
  | { status: "no-directory" }
  | { status: "unavailable"; message: string };

/**
 * Result of one local save through the Manager Local Save Host (#59).
 * Typed - never string-matched: `permission-required` and `unavailable`
 * pause the whole batch, `error` fails only the single item.
 */
export type LocalSaveOutcome =
  | { status: "saved"; result: LocalSaveResult }
  | { status: "permission-required" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

export interface BatchVideo {
  videoId: string;
  url: string;
  title: string;
}

export interface BatchItem {
  video: BatchVideo;
  local: BatchItemState;
  cloud: BatchItemState;
  localReceipt?: LocalSaveReceipt;
  cloudReceipt?: CloudReceipt;
  localError?: string;
  cloudError?: string;
  /** Cloud Job this item's capture was handed to, for traceability. */
  cloudJobId?: string;
  /** When this item's current attempt started (ms epoch), for the ETA. */
  startedAt?: number;
  /** When this item's current attempt reached a terminal state (ms epoch). */
  finishedAt?: number;
}

export interface BatchTask {
  id: string;
  destinations: BatchDestination[];
  items: BatchItem[];
  state: "queued" | "running" | "paused" | "completed" | "stopped";
  /** Why a `paused` task is paused; absent on records from before #59. */
  pauseReason?: BatchPauseReason;
  createdAt: number;
  updatedAt: number;
}

export interface BatchJobStore {
  create(
    videos: BatchVideo[],
    options: {
      destinations: BatchDestination[];
      localReceipts?: LocalSaveReceipt[];
      cloudReceipts?: CloudReceipt[];
      now?: number;
      newId?: () => string;
    },
  ): Promise<BatchTask>;
  get(id: string): Promise<BatchTask | undefined>;
  put(task: BatchTask): Promise<void>;
  list(): Promise<BatchTask[]>;
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
      if (!operation.result.objectStoreNames.contains(TASK_STORE)) {
        operation.result.createObjectStore(TASK_STORE, { keyPath: "id" });
      }
    };
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

async function withStore<T>(
  indexedDB: IDBFactory,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openDatabase(indexedDB);
  try {
    const transaction = database.transaction(TASK_STORE, mode);
    const result = await action(transaction.objectStore(TASK_STORE));
    await transactionComplete(transaction);
    return result;
  } finally {
    database.close();
  }
}

function uniqueDestinations(
  destinations: BatchDestination[],
): BatchDestination[] {
  return [...new Set(destinations)];
}

export function createBatchJobStore(
  options: { indexedDB?: IDBFactory; newId?: () => string } = {},
): BatchJobStore {
  const indexedDB = options.indexedDB ?? globalThis.indexedDB;
  const newId = options.newId ?? (() => crypto.randomUUID());

  return {
    async create(videos, createOptions) {
      if (videos.length === 0) throw new Error("Select at least one video.");
      const destinations = uniqueDestinations(createOptions.destinations);
      if (destinations.length === 0) {
        throw new Error("Select at least one save destination.");
      }
      const localByVideo = new Map(
        (createOptions.localReceipts ?? []).map((receipt) => [
          receipt.videoId,
          receipt,
        ]),
      );
      const cloudByVideo = new Map(
        (createOptions.cloudReceipts ?? []).map((receipt) => [
          receipt.videoId,
          receipt,
        ]),
      );
      const runnableCount = videos.filter((video) =>
        destinations.some((destination) =>
          destination === "local"
            ? !localByVideo.has(video.videoId)
            : !cloudByVideo.has(video.videoId),
        ),
      ).length;
      if (runnableCount > BATCH_MAX_RUNNABLE_ITEMS) {
        throw new Error(
          `A batch can contain at most ${BATCH_MAX_RUNNABLE_ITEMS} videos that still need saving.`,
        );
      }
      const now = createOptions.now ?? Date.now();
      const task: BatchTask = {
        id: (createOptions.newId ?? newId)(),
        destinations,
        items: videos.map((video) => {
          const localReceipt = localByVideo.get(video.videoId);
          const cloudReceipt = cloudByVideo.get(video.videoId);
          return {
            video,
            local: destinations.includes("local")
              ? localReceipt
                ? "skipped"
                : "queued"
              : "skipped",
            cloud: destinations.includes("cloud")
              ? cloudReceipt
                ? "skipped"
                : "queued"
              : "skipped",
            ...(localReceipt ? { localReceipt } : {}),
            ...(cloudReceipt ? { cloudReceipt } : {}),
          };
        }),
        state: "queued",
        createdAt: now,
        updatedAt: now,
      };
      await withStore(indexedDB, "readwrite", async (store) => {
        store.put(task);
      });
      return task;
    },

    get(id) {
      return withStore(
        indexedDB,
        "readonly",
        async (store) =>
          (await request(store.get(id))) as BatchTask | undefined,
      );
    },

    async put(task) {
      await withStore(indexedDB, "readwrite", async (store) => {
        store.put(task);
      });
    },

    list() {
      return withStore(
        indexedDB,
        "readonly",
        async (store) => (await request(store.getAll())) as BatchTask[],
      );
    },
  };
}
