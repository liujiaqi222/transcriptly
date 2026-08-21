import type { Capture } from "@transcriptly/schema";

/**
 * Cloud Job store (#35, #36): the background service worker persists every
 * cloud upload as a Job in IndexedDB so an upload survives popup close,
 * service worker restarts, and can be retried after a failure.
 *
 * The `kind` field reserves a seam for future job types (e.g. #26 batch
 * capture) without building a generic workflow engine: the store stays a
 * single-consumer cloud-upload queue.
 */

const CLOUD_DATABASE_NAME = "transcriptly-cloud";
const CLOUD_DATABASE_VERSION = 1;
const JOB_STORE = "cloud-jobs";

/** The only job type today; kept as a field for #26's future consumers. */
export type CloudJobKind = "cloud-upload";

export type CloudJobState = "pending" | "uploading" | "saved" | "failed";

/**
 * How a failure should be presented and whether retry is offered.
 * - network: the request never completed; retry offered.
 * - retryable: 429 / 5xx / interrupted; retry offered.
 * - auth: 401/403 - no replay (#32: there is no token to refresh); the user
 *   signs in again and can then explicitly retry.
 * - permanent: validation/conflict/size/media-type; no retry.
 */
export type CloudFailureKind = "network" | "retryable" | "auth" | "permanent";

export interface CloudReceipt {
  videoId: string;
  /** Library Item identity from the upload response (#28 contract). */
  libraryItemId: string;
  outcome: "created" | "updated" | "unchanged";
  /** ISO timestamp of the successful upload. */
  savedAt: string;
}

export interface CloudFailure {
  kind: CloudFailureKind;
  code: string;
  message: string;
  httpStatus?: number;
}

/** A full persisted Job. The Capture payload is deleted once saved. */
export interface CloudJobRecord {
  id: string;
  kind: CloudJobKind;
  videoId: string;
  title: string;
  state: CloudJobState;
  /** Present while pending/uploading/failed; removed after success. */
  capture?: Capture;
  receipt?: CloudReceipt;
  failure?: CloudFailure;
  /** Epoch milliseconds; FIFO order for pending jobs. */
  createdAt: number;
  updatedAt: number;
}

/** The popup-facing projection of a Job: never carries the Capture payload. */
export interface CloudJobSummary {
  id: string;
  videoId: string;
  title: string;
  state: CloudJobState;
  receipt?: CloudReceipt;
  failure?: CloudFailure;
}

export interface CloudSnapshot {
  /** Status of the currently viewed video, when a Job or receipt exists. */
  current?: CloudJobSummary;
  /** Every failed Job, for the popup's failure badge. */
  failed: CloudJobSummary[];
}

/** Failed payloads are discarded after this many milliseconds. */
export const FAILED_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface CloudJobStore {
  /**
   * Persist a Capture for upload. A pending or failed Job for the same
   * videoId is superseded (payload replaced); an uploading Job is left alone
   * and the new Capture is queued behind it (#35 AC).
   */
  enqueue(capture: Capture): Promise<CloudJobRecord>;
  /** Oldest pending Job in FIFO order, payload included. */
  takeNextPending(): Promise<CloudJobRecord | undefined>;
  markUploading(jobId: string): Promise<void>;
  /** Delete the payload and keep only the lightweight receipt. */
  completeSaved(jobId: string, receipt: CloudReceipt): Promise<void>;
  completeFailed(jobId: string, failure: CloudFailure): Promise<void>;
  /** Move a failed Job back to pending for an explicit user retry. */
  retry(jobId: string): Promise<CloudJobRecord | undefined>;
  /**
   * Startup recovery: Jobs stuck in `uploading` (the worker died mid-upload)
   * become failed instead of being replayed automatically (#36 AC), and
   * expired failed Jobs are deleted. `skipJobIds` excludes Jobs the caller
   * knows are actively uploading in this worker, so a periodic alarm can
   * never mistake a live upload for a dead worker's leftover.
   */
  recover(options?: { now?: number; skipJobIds?: string[] }): Promise<void>;
  snapshot(videoId?: string): Promise<CloudSnapshot>;
  /** Sign-out: drop every Job, payload and receipt (#36 AC). */
  clearAll(): Promise<void>;
}

export interface CloudJobStoreOptions {
  indexedDB?: IDBFactory;
  /** Test seam for identity generation. */
  newId?: () => string;
  /** Test seam for the clock. */
  now?: () => number;
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

function openCloudDatabase(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const operation = indexedDB.open(
      CLOUD_DATABASE_NAME,
      CLOUD_DATABASE_VERSION,
    );
    operation.onupgradeneeded = () => {
      const database = operation.result;
      if (!database.objectStoreNames.contains(JOB_STORE)) {
        const store = database.createObjectStore(JOB_STORE, { keyPath: "id" });
        store.createIndex("state", "state");
        store.createIndex("videoId", "videoId");
      }
    };
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

function toSummary(record: CloudJobRecord): CloudJobSummary {
  return {
    id: record.id,
    videoId: record.videoId,
    title: record.title,
    state: record.state,
    ...(record.receipt ? { receipt: record.receipt } : {}),
    ...(record.failure ? { failure: record.failure } : {}),
  };
}

export function createCloudJobStore(
  options: CloudJobStoreOptions = {},
): CloudJobStore {
  const indexedDB = options.indexedDB ?? globalThis.indexedDB;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => Date.now());

  async function withStore<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const database = await openCloudDatabase(indexedDB);
    try {
      const transaction = database.transaction(JOB_STORE, mode);
      const result = await action(transaction.objectStore(JOB_STORE));
      await transactionComplete(transaction);
      return result;
    } finally {
      database.close();
    }
  }

  async function findSupersedeable(
    store: IDBObjectStore,
    videoId: string,
  ): Promise<CloudJobRecord | undefined> {
    const records = (await request(
      store.index("videoId").getAll(videoId),
    )) as CloudJobRecord[];
    return records.find(
      (record) => record.state === "pending" || record.state === "failed",
    );
  }

  return {
    async enqueue(capture) {
      return withStore("readwrite", async (store) => {
        const videoId = capture.source.videoId;
        const existing = await findSupersedeable(store, videoId);
        const timestamp = now();
        const record: CloudJobRecord = existing
          ? {
              ...existing,
              state: "pending",
              capture,
              title: capture.source.title,
              // Clear stale result/failure from the superseded attempt but
              // keep the original createdAt so FIFO position is preserved.
              receipt: undefined,
              failure: undefined,
              updatedAt: timestamp,
            }
          : {
              id: newId(),
              kind: "cloud-upload",
              videoId,
              title: capture.source.title,
              state: "pending",
              capture,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
        store.put(record);
        return record;
      });
    },

    async takeNextPending() {
      return withStore("readonly", async (store) => {
        const records = (await request(
          store.index("state").getAll("pending"),
        )) as CloudJobRecord[];
        if (records.length === 0) return undefined;
        records.sort((a, b) => {
          if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
          return a.id < b.id ? -1 : 1;
        });
        return records[0];
      });
    },

    async markUploading(jobId) {
      await withStore("readwrite", async (store) => {
        const record = (await request(store.get(jobId))) as
          | CloudJobRecord
          | undefined;
        if (record && record.state === "pending") {
          store.put({ ...record, state: "uploading", updatedAt: now() });
        }
      });
    },

    async completeSaved(jobId, receipt) {
      await withStore("readwrite", async (store) => {
        const record = (await request(store.get(jobId))) as
          | CloudJobRecord
          | undefined;
        if (record?.state !== "uploading") return;

        // Older saved receipts for the same videoId are superseded: one
        // lightweight receipt per video (#35 AC).
        const sameVideo = (await request(
          store.index("videoId").getAll(record.videoId),
        )) as CloudJobRecord[];
        for (const other of sameVideo) {
          if (other.id !== jobId && other.state === "saved") {
            store.delete(other.id);
          }
        }

        store.put({
          ...record,
          state: "saved",
          capture: undefined,
          receipt,
          updatedAt: now(),
        });
      });
    },

    async completeFailed(jobId, failure) {
      await withStore("readwrite", async (store) => {
        const record = (await request(store.get(jobId))) as
          | CloudJobRecord
          | undefined;
        if (record && record.state === "uploading") {
          store.put({
            ...record,
            state: "failed",
            failure,
            updatedAt: now(),
          });
        }
      });
    },

    async retry(jobId) {
      return withStore("readwrite", async (store) => {
        const record = (await request(store.get(jobId))) as
          | CloudJobRecord
          | undefined;
        if (
          record?.state !== "failed" ||
          !record.capture ||
          // Permanent failures (validation/conflict/size/media type) can
          // never succeed on retry (#36) - they are not re-queued.
          record.failure?.kind === "permanent"
        ) {
          return undefined;
        }
        const updated: CloudJobRecord = {
          ...record,
          state: "pending",
          failure: undefined,
          updatedAt: now(),
        };
        store.put(updated);
        return updated;
      });
    },

    async recover(recoverOptions) {
      const currentTime = recoverOptions?.now ?? now();
      const activeJobIds = new Set(recoverOptions?.skipJobIds ?? []);
      await withStore("readwrite", async (store) => {
        const records = (await request(store.getAll())) as CloudJobRecord[];
        for (const record of records) {
          if (record.state === "uploading" && !activeJobIds.has(record.id)) {
            store.put({
              ...record,
              state: "failed",
              failure: {
                kind: "retryable",
                code: "interrupted",
                message:
                  "The upload was interrupted before it completed. Retry to upload it again.",
              },
              updatedAt: currentTime,
            });
          } else if (
            record.state === "failed" &&
            currentTime - record.updatedAt > FAILED_JOB_RETENTION_MS
          ) {
            store.delete(record.id);
          }
        }
      });
    },

    async snapshot(videoId) {
      return withStore("readonly", async (store) => {
        const failed: CloudJobSummary[] = [];
        let current: CloudJobSummary | undefined;
        let currentUpdatedAt = Number.NEGATIVE_INFINITY;

        await new Promise<void>((resolve, reject) => {
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
              resolve();
              return;
            }
            const record = cursor.value as CloudJobRecord;
            if (record.state === "failed") {
              failed.push(toSummary(record));
            }
            if (videoId && record.videoId === videoId) {
              // Prefer the most recently updated record for this video.
              if (record.updatedAt > currentUpdatedAt) {
                current = toSummary(record);
                currentUpdatedAt = record.updatedAt;
              }
            }
            cursor.continue();
          };
          cursorRequest.onerror = () => reject(cursorRequest.error);
        });

        failed.sort((a, b) => a.videoId.localeCompare(b.videoId));
        return { ...(current ? { current } : {}), failed };
      });
    },

    async clearAll() {
      await withStore("readwrite", async (store) => {
        store.clear();
      });
    },
  };
}
