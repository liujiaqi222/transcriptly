import type { BatchItem, BatchTask } from "./jobs";

/**
 * Remaining-time estimates for the batch manager page (#58).
 *
 * While a batch runs, the ETA multiplies the still-pending videos by a
 * sliding average of the last few completed item durations (recorded by
 * the executor as startedAt / finishedAt). Before any item has finished,
 * it falls back to the same planning constant the selection toolbar
 * shows (the spec's ~15-20 s per video).
 */

/** Planning fallback (the spec's 15-20 s per video). */
export const ETA_FALLBACK_SECONDS_PER_VIDEO = 18;
/** How many finished items feed the sliding duration average. */
export const ETA_WINDOW = 5;

function isPending(item: BatchItem): boolean {
  return (
    item.local === "queued" ||
    item.local === "running" ||
    item.cloud === "queued" ||
    item.cloud === "running"
  );
}

/** Items that no longer have anything left to run. */
export function doneItemCount(task: BatchTask): number {
  return task.items.filter((item) => !isPending(item)).length;
}

/** Items that still have a queued or running destination. */
export function pendingItemCount(task: BatchTask): number {
  return task.items.filter(isPending).length;
}

/** Failed count for summaries / history rows. */
export function failedItemCount(task: BatchTask): number {
  return task.items.filter(
    (item) => item.local === "failed" || item.cloud === "failed",
  ).length;
}

/**
 * Estimated seconds until the batch finishes, or undefined when nothing
 * is pending or the batch is not running (Paused / Stopped / Completed
 * show no ETA).
 */
export function estimateRemainingSeconds(task: BatchTask): number | undefined {
  if (task.state !== "running" && task.state !== "queued") return undefined;
  const pending = pendingItemCount(task);
  if (pending === 0) return undefined;

  const durations = task.items
    .filter(
      (item) =>
        item.startedAt !== undefined &&
        item.finishedAt !== undefined &&
        item.finishedAt >= item.startedAt,
    )
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, ETA_WINDOW)
    .map((item) => ((item.finishedAt ?? 0) - (item.startedAt ?? 0)) / 1000);
  const average =
    durations.length > 0
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : ETA_FALLBACK_SECONDS_PER_VIDEO;

  return Math.ceil(pending * Math.max(average, 1));
}

/** "3 min", "45 s" - human label for an ETA in seconds. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
