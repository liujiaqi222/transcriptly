import type { Capture } from "@transcriptly/schema";
import type {
  CloudJobRecord,
  CloudQueueStatus,
  CloudReceipt,
} from "@/cloud/jobs";
import type { LocalSaveReceipt } from "@/local-save";
import type { BatchMutationStatus } from "@/shared/messages";
import type {
  BatchDestination,
  BatchItem,
  BatchItemState,
  BatchJobStore,
  BatchPauseReason,
  BatchTask,
  BatchVideo,
  LocalPreflightOutcome,
  LocalSaveOutcome,
} from "./jobs";

/**
 * Single-concurrency batch executor (#26).
 *
 * Consumes persisted BatchTasks: for every still-queued video it opens a
 * watch tab (via `captureVideo`), captures the transcript, saves to the
 * selected Local / Cloud destinations independently, and persists each
 * per-destination result. One video runs at a time with a pause between
 * videos; a service-worker restart re-queues whatever was mid-flight.
 *
 * Interruption is ask-first (#59): before each local save a permission
 * preflight runs, and a missing folder grant or an unreachable Local
 * Save Host pauses the whole task with a persisted reason instead of
 * burning per-item timeouts. Cloud results are never rolled back by a
 * local pause.
 */

/** Pause between two videos of the same task. */
export const BATCH_ITEM_INTERVAL_MS = 2000;
/** How long one video's tab + capture may take (enforced by `captureVideo`). */
export const BATCH_CAPTURE_TIMEOUT_MS = 90_000;
/** How long the executor waits for a queued cloud upload to finish. */
export const BATCH_CLOUD_WAIT_TIMEOUT_MS = 120_000;
export const BATCH_CLOUD_POLL_MS = 500;

export interface BatchExecutorDependencies {
  store: BatchJobStore;
  /** Must be bounded (see createTabVideoCapture). */
  captureVideo(video: BatchVideo): Promise<Capture>;
  /** Folder permission check before any capture (#59). */
  preflightLocal(): Promise<LocalPreflightOutcome>;
  saveLocal(capture: Capture): Promise<LocalSaveOutcome>;
  enqueueCloud(capture: Capture): Promise<{ jobId: string }>;
  getCloudJob(
    jobId: string,
  ): Promise<Pick<CloudJobRecord, "state" | "receipt" | "failure"> | undefined>;
  findLocalReceipt(videoId: string): Promise<LocalSaveReceipt | undefined>;
  findCloudReceipt(videoId: string): Promise<CloudReceipt | undefined>;
  delay?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface BatchExecutor {
  /** Continue every queued/running task; safe to call repeatedly. */
  wake(): Promise<void>;
  pause(taskId: string): Promise<BatchMutationStatus>;
  resume(taskId: string): Promise<BatchMutationStatus>;
  /** Cancel every video that has not started yet. */
  stop(taskId: string): Promise<BatchMutationStatus>;
  /** Re-queue one video's failed/skipped/cancelled save. */
  retryItem(
    taskId: string,
    videoId: string,
    destinations?: BatchDestination[],
  ): Promise<BatchMutationStatus>;
}

type CloudWaitOutcome =
  | { ok: true; receipt: CloudReceipt }
  | { ok: false; message: string };

/** Local problems that pause the whole task (#59). */
type LocalPauseReason = Extract<
  BatchPauseReason,
  "local-permission" | "local-save-unavailable"
>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isQueuedFor(task: BatchTask, item: BatchItem): boolean {
  return (
    (item.local === "queued" && task.destinations.includes("local")) ||
    (item.cloud === "queued" && task.destinations.includes("cloud"))
  );
}

export function createBatchExecutor(
  deps: BatchExecutorDependencies,
): BatchExecutor {
  const delay =
    deps.delay ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => Date.now());

  let running = false;
  let wakeAgain = false;

  async function persist(task: BatchTask): Promise<void> {
    task.updatedAt = now();
    await deps.store.put(task);
  }

  /**
   * Re-reads the task and applies an update to one item. The update closure
   * must check the item's current state itself: a concurrent stop/retry may
   * have replaced it since the caller claimed it.
   */
  async function applyItemUpdate(
    taskId: string,
    videoId: string,
    update: (item: BatchItem) => void,
  ): Promise<void> {
    const task = await deps.store.get(taskId);
    if (!task) return;
    const item = task.items.find(
      (candidate) => candidate.video.videoId === videoId,
    );
    if (!item) return;
    const before =
      `${item.local}|${item.cloud}|${item.localError ?? ""}|${item.cloudError ?? ""}` +
      `|${item.startedAt ?? ""}|${item.finishedAt ?? ""}`;
    update(item);
    const after =
      `${item.local}|${item.cloud}|${item.localError ?? ""}|${item.cloudError ?? ""}` +
      `|${item.startedAt ?? ""}|${item.finishedAt ?? ""}`;
    if (before !== after) await persist(task);
  }

  async function waitCloudJob(jobId: string): Promise<CloudWaitOutcome> {
    const deadline = now() + BATCH_CLOUD_WAIT_TIMEOUT_MS;
    for (;;) {
      const job = await deps.getCloudJob(jobId);
      if (!job) {
        return {
          ok: false,
          message:
            "The cloud upload disappeared from the queue. Retry this item.",
        };
      }
      if (job.state === "saved" && job.receipt) {
        return { ok: true, receipt: job.receipt };
      }
      if (job.state === "failed" && job.failure) {
        return { ok: false, message: job.failure.message };
      }
      if (now() >= deadline) {
        return {
          ok: false,
          message:
            "The cloud upload did not finish in time. Retry this item in a moment.",
        };
      }
      await delay(BATCH_CLOUD_POLL_MS);
    }
  }

  /** Pause a still-active task with a persisted reason (#59). */
  async function pauseTask(
    taskId: string,
    pauseReason: BatchPauseReason,
  ): Promise<void> {
    const task = await deps.store.get(taskId);
    if (!task) return;
    if (task.state !== "running" && task.state !== "queued") return;
    task.state = "paused";
    task.pauseReason = pauseReason;
    await persist(task);
  }

  async function runItem(
    taskId: string,
    videoId: string,
  ): Promise<LocalPauseReason | undefined> {
    // Receipts may have appeared since the task was created (a single save
    // from the popup, or an interrupted earlier run that wrote the file).
    const snapshot = await deps.store.get(taskId);
    const item = snapshot?.items.find(
      (candidate) => candidate.video.videoId === videoId,
    );
    if (!snapshot || !item || !isQueuedFor(snapshot, item)) return;

    const [localReceipt, cloudReceipt] = await Promise.all([
      item.local === "queued" && snapshot.destinations.includes("local")
        ? deps.findLocalReceipt(videoId)
        : Promise.resolve(undefined),
      item.cloud === "queued" && snapshot.destinations.includes("cloud")
        ? deps.findCloudReceipt(videoId)
        : Promise.resolve(undefined),
    ]);
    if (localReceipt || cloudReceipt) {
      const skipTask = await deps.store.get(taskId);
      const skipItem = skipTask?.items.find(
        (candidate) => candidate.video.videoId === videoId,
      );
      if (skipTask && skipItem) {
        let changed = false;
        if (localReceipt && skipItem.local === "queued") {
          skipItem.local = "skipped";
          skipItem.localReceipt = localReceipt;
          skipItem.localError = undefined;
          changed = true;
        }
        if (cloudReceipt && skipItem.cloud === "queued") {
          skipItem.cloud = "skipped";
          skipItem.cloudReceipt = cloudReceipt;
          skipItem.cloudError = undefined;
          changed = true;
        }
        if (changed) await persist(skipTask);
      }
    }

    const fresh = await deps.store.get(taskId);
    const freshItem = fresh?.items.find(
      (candidate) => candidate.video.videoId === videoId,
    );
    if (!fresh || !freshItem || !isQueuedFor(fresh, freshItem)) return;
    const video = freshItem.video;
    const runLocal =
      freshItem.local === "queued" && fresh.destinations.includes("local");
    const runCloud =
      freshItem.cloud === "queued" && fresh.destinations.includes("cloud");

    // Claim both destinations for this worker before any slow work.
    // startedAt feeds the manager page's per-item duration estimate (#58).
    await applyItemUpdate(taskId, videoId, (item) => {
      if (runLocal && item.local === "queued") {
        item.local = "running";
        item.localError = undefined;
        item.localReceipt = undefined;
      }
      if (runCloud && item.cloud === "queued") {
        item.cloud = "running";
        item.cloudError = undefined;
        item.cloudJobId = undefined;
      }
      item.startedAt = now();
      item.finishedAt = undefined;
    });

    let capture: Capture | undefined;
    let captureError: string | undefined;
    try {
      capture = await deps.captureVideo(video);
    } catch (error) {
      captureError = errorMessage(error);
    }

    // A local problem that must pause the whole task (#59). Set below,
    // applied by runTask after the cloud half of this item finished -
    // already-enqueued cloud results are never rolled back.
    let localPause: LocalPauseReason | undefined;

    if (runLocal) {
      if (captureError || !capture) {
        const message = captureError ?? "The transcript could not be captured.";
        await applyItemUpdate(taskId, videoId, (item) => {
          if (item.local !== "running") return;
          item.local = "failed";
          item.localError = message;
        });
      } else {
        const outcome = await deps.saveLocal(capture);
        if (outcome.status === "saved") {
          const result = outcome.result;
          await applyItemUpdate(taskId, videoId, (item) => {
            if (item.local !== "running") return;
            item.local = "saved";
            item.localReceipt = {
              videoId,
              filename: result.filename,
              directoryName: result.directoryName,
              savedAt: new Date(now()).toISOString(),
            };
            // The Markdown file exists; an index failure is a warning only.
            item.localError = result.receiptError;
          });
        } else if (
          outcome.status === "permission-required" ||
          outcome.status === "unavailable"
        ) {
          // Missing grant or a lost Local Save Host: the item goes back
          // to `queued` (never `failed`) and the task pauses after this
          // item's cloud half (#59).
          localPause =
            outcome.status === "permission-required"
              ? "local-permission"
              : "local-save-unavailable";
          await applyItemUpdate(taskId, videoId, (item) => {
            if (item.local !== "running") return;
            item.local = "queued";
            item.localError = undefined;
          });
        } else {
          await applyItemUpdate(taskId, videoId, (item) => {
            if (item.local !== "running") return;
            item.local = "failed";
            item.localError = outcome.message;
          });
        }
      }
    }

    if (runCloud) {
      if (captureError || !capture) {
        const message = captureError ?? "The transcript could not be captured.";
        await applyItemUpdate(taskId, videoId, (item) => {
          if (item.cloud !== "running") return;
          item.cloud = "failed";
          item.cloudError = message;
        });
      } else {
        try {
          const { jobId } = await deps.enqueueCloud(capture);
          const outcome = await waitCloudJob(jobId);
          await applyItemUpdate(taskId, videoId, (item) => {
            if (item.cloud !== "running") return;
            item.cloudJobId = jobId;
            if (outcome.ok) {
              item.cloud = "saved";
              item.cloudReceipt = outcome.receipt;
              item.cloudError = undefined;
            } else {
              item.cloud = "failed";
              item.cloudError = outcome.message;
            }
          });
        } catch (error) {
          const message = errorMessage(error);
          await applyItemUpdate(taskId, videoId, (item) => {
            if (item.cloud !== "running") return;
            item.cloud = "failed";
            item.cloudError = message;
          });
        }
      }
    }
    // Stamp the attempt's end once both destinations are terminal, so
    // the manager can estimate the remaining time (#58). A re-queued
    // local destination (permission pause) is not terminal and is
    // re-stamped by its next attempt.
    await applyItemUpdate(taskId, videoId, (item) => {
      const terminal = (state: BatchItemState) =>
        state !== "queued" && state !== "running";
      if (
        item.startedAt !== undefined &&
        item.finishedAt === undefined &&
        terminal(item.local) &&
        terminal(item.cloud)
      ) {
        item.finishedAt = now();
      }
    });

    return localPause;
  }

  async function runTask(taskId: string): Promise<void> {
    for (;;) {
      const task = await deps.store.get(taskId);
      if (!task) return;
      if (task.state === "queued") {
        task.state = "running";
        await persist(task);
      }
      // Pause/stop take effect between videos: the current one finishes.
      if (task.state !== "running") return;

      const pending = task.items.find((item) => isQueuedFor(task, item));
      if (!pending) {
        task.state = "completed";
        task.pauseReason = undefined;
        await persist(task);
        return;
      }

      // Local permission preflight (#59): without a usable folder grant
      // no watch tab is opened and no capture starts - the task pauses
      // immediately for an explicit grant instead of waiting per item.
      if (task.destinations.includes("local") && pending.local === "queued") {
        const preflight = await deps.preflightLocal();
        if (
          preflight.status === "permission-required" ||
          preflight.status === "no-directory"
        ) {
          await pauseTask(taskId, "local-permission");
          return;
        }
        if (preflight.status === "unavailable") {
          await pauseTask(taskId, "local-save-unavailable");
          return;
        }
      }

      const localPause = await runItem(taskId, pending.video.videoId);
      if (localPause) {
        await pauseTask(taskId, localPause);
        return;
      }

      const after = await deps.store.get(taskId);
      if (
        after &&
        after.state === "running" &&
        after.items.some((item) => isQueuedFor(after, item))
      ) {
        await delay(BATCH_ITEM_INTERVAL_MS);
      }
    }
  }

  /**
   * A previous service worker may have died mid-video: anything still marked
   * `running` belongs to a dead worker and is re-queued.
   */
  async function recoverInterruptedItems(): Promise<void> {
    for (const task of await deps.store.list()) {
      if (task.state !== "running" && task.state !== "queued") continue;
      let changed = false;
      for (const item of task.items) {
        if (item.local === "running") {
          item.local = "queued";
          changed = true;
        }
        if (item.cloud === "running") {
          item.cloud = "queued";
          changed = true;
        }
      }
      if (changed) await persist(task);
    }
  }

  async function findTask(
    taskId: string,
  ): Promise<
    | { task: BatchTask; message?: undefined }
    | { task?: undefined; message: string }
  > {
    const task = await deps.store.get(taskId);
    return task ? { task } : { message: "That batch task no longer exists." };
  }

  return {
    async wake() {
      for (;;) {
        if (running) {
          wakeAgain = true;
          return;
        }
        running = true;
        try {
          do {
            wakeAgain = false;
            await recoverInterruptedItems();
            for (;;) {
              const tasks = await deps.store.list();
              const task = tasks
                .filter(
                  (candidate) =>
                    candidate.state === "queued" ||
                    candidate.state === "running",
                )
                .sort((a, b) => a.createdAt - b.createdAt)[0];
              if (!task) break;
              await runTask(task.id);
            }
          } while (wakeAgain);
        } finally {
          running = false;
        }
        if (!wakeAgain) return;
        wakeAgain = false;
      }
    },

    async pause(taskId) {
      const { task, message } = await findTask(taskId);
      if (!task) return { ok: false, message };
      if (task.state !== "running" && task.state !== "queued") {
        return {
          ok: false,
          message: "Only a running batch can be paused.",
        };
      }
      task.state = "paused";
      task.pauseReason = "user";
      await persist(task);
      return { ok: true };
    },

    async resume(taskId) {
      const { task, message } = await findTask(taskId);
      if (!task) return { ok: false, message };
      if (task.state !== "paused") {
        return { ok: false, message: "Only a paused batch can be resumed." };
      }
      task.state = "queued";
      // Whatever paused it no longer applies (#59).
      task.pauseReason = undefined;
      await persist(task);
      await this.wake();
      return { ok: true };
    },

    async stop(taskId) {
      const { task, message } = await findTask(taskId);
      if (!task) return { ok: false, message };
      if (
        task.state !== "running" &&
        task.state !== "queued" &&
        task.state !== "paused"
      ) {
        return { ok: false, message: "Only an active batch can be stopped." };
      }
      for (const item of task.items) {
        if (item.local === "queued") item.local = "cancelled";
        if (item.cloud === "queued") item.cloud = "cancelled";
      }
      task.state = "stopped";
      task.pauseReason = undefined;
      await persist(task);
      return { ok: true };
    },

    async retryItem(taskId, videoId, destinations) {
      const { task, message } = await findTask(taskId);
      if (!task) return { ok: false, message };
      if (task.state === "running" || task.state === "queued") {
        return {
          ok: false,
          message: "Pause or stop the batch before retrying a video.",
        };
      }
      const item = task.items.find(
        (candidate) => candidate.video.videoId === videoId,
      );
      if (!item) {
        return { ok: false, message: "That video is not part of this batch." };
      }
      const targets = (destinations ?? task.destinations).filter(
        (destination) => task.destinations.includes(destination),
      );
      const retryable: BatchItemState[] = ["failed", "skipped", "cancelled"];
      let requeued = false;
      for (const destination of targets) {
        if (destination === "local" && retryable.includes(item.local)) {
          item.local = "queued";
          item.localError = undefined;
          requeued = true;
        }
        if (destination === "cloud" && retryable.includes(item.cloud)) {
          item.cloud = "queued";
          item.cloudError = undefined;
          requeued = true;
        }
      }
      if (requeued) {
        // The next attempt re-stamps these when it claims the item.
        item.startedAt = undefined;
        item.finishedAt = undefined;
      }
      if (!requeued) {
        return {
          ok: false,
          message: "Only failed, skipped, or cancelled saves can be retried.",
        };
      }
      task.state = "queued";
      task.pauseReason = undefined;
      await persist(task);
      await this.wake();
      return { ok: true };
    },
  };
}

/** Shared helper for the router: cloud receipt of a saved video, if any. */
export function savedCloudReceipt(
  status: CloudQueueStatus,
): CloudReceipt | undefined {
  const current = status.current;
  return current?.state === "saved" ? current.receipt : undefined;
}
