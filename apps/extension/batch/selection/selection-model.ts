import {
  BATCH_MAX_RUNNABLE_ITEMS,
  type BatchDestination,
  type BatchVideo,
} from "@/batch/jobs";
import type { BatchLookupVideo } from "@/shared/messages";

/**
 * Pure selection state for the on-page batch toolbar (#57).
 *
 * Tracks which videos the feed currently shows, which are selected,
 * which already have saved receipts, and which destinations are checked -
 * then derives everything the UI needs from that: quota, skip-vs-runnable
 * split, counter text, and the select-all walk. No DOM, no messaging;
 * the panel and card layers are projections of this model.
 */

/** Planning estimate for one video's capture + save (the spec's 15-20 s). */
const SECONDS_PER_VIDEO = 18;

export function batchFullToast(): string {
  return `Batch full (${BATCH_MAX_RUNNABLE_ITEMS}/${BATCH_MAX_RUNNABLE_ITEMS}) - a batch can contain at most ${BATCH_MAX_RUNNABLE_ITEMS} videos that still need saving. Start this batch, then start another - batches run one after another.`;
}

function estimatedMinutes(videos: number): number {
  return Math.max(1, Math.ceil((videos * SECONDS_PER_VIDEO) / 60));
}

export interface SelectionModel {
  /** Registers currently loaded videos; returns ids never seen before. */
  ingest(videos: BatchVideo[]): string[];
  setSavedInfo(videos: BatchLookupVideo[]): void;
  /** Checked destinations; kept in sync by the toolbar's owner. */
  setDestinations(destinations: BatchDestination[]): void;
  isChecked(videoId: string): boolean;
  setChecked(videoId: string, checked: boolean): void;
  /** Selected videos in selection order, for BATCH_START. */
  checkedVideos(): BatchVideo[];
  /** True when the video is selected but every checked destination has it. */
  willBeSkipped(videoId: string): boolean;
  /** Selected videos that will actually run; saved ones occupy no quota. */
  runnableCount(): number;
  isCheckDisabled(videoId: string): boolean;
  /** Checks videos in page order up to quota; true when the cap was hit. */
  selectUpToQuota(): boolean;
  clearSelection(): void;
  counterText(): string;
  counterFull(): boolean;
  /** Saved receipts for a video, when the worker has answered. */
  savedInfo(videoId: string): BatchLookupVideo | undefined;
  /** Discovered video ids, in page order. */
  videoIds(): string[];
  /** Drops everything (new batch source). */
  clear(): void;
}

export function createSelectionModel(): SelectionModel {
  const knownVideos = new Map<string, BatchVideo>();
  const selectedVideoIds = new Set<string>();
  const savedInfo = new Map<string, BatchLookupVideo>();
  let destinations: BatchDestination[] = [];

  function willBeSkipped(videoId: string): boolean {
    if (destinations.length === 0) return false;
    const info = savedInfo.get(videoId);
    if (!info) return false;
    return destinations.every((destination) =>
      destination === "local" ? info.localSaved : info.cloudSaved,
    );
  }

  function runnableCount(): number {
    let count = 0;
    for (const videoId of selectedVideoIds) {
      if (!willBeSkipped(videoId)) count += 1;
    }
    return count;
  }

  function counterText(): string {
    const runnable = runnableCount();
    const skipped = selectedVideoIds.size - runnable;
    let text = `${runnable}/${BATCH_MAX_RUNNABLE_ITEMS}`;
    if (runnable > 0) text += ` · ~${estimatedMinutes(runnable)} min`;
    if (skipped > 0) text += ` · ${skipped} saved`;
    return text;
  }

  return {
    ingest(videos) {
      const newIds: string[] = [];
      for (const video of videos) {
        if (!knownVideos.has(video.videoId)) newIds.push(video.videoId);
        knownVideos.set(video.videoId, video);
      }
      return newIds;
    },
    setSavedInfo(videos) {
      for (const video of videos) savedInfo.set(video.videoId, video);
    },
    setDestinations(nextDestinations) {
      destinations = nextDestinations;
    },
    isChecked(videoId) {
      return selectedVideoIds.has(videoId);
    },
    setChecked(videoId, checked) {
      if (checked) selectedVideoIds.add(videoId);
      else selectedVideoIds.delete(videoId);
    },
    checkedVideos() {
      return [...selectedVideoIds]
        .map((videoId) => knownVideos.get(videoId))
        .filter((video): video is BatchVideo => Boolean(video));
    },
    willBeSkipped,
    runnableCount,
    isCheckDisabled(videoId) {
      if (selectedVideoIds.has(videoId)) return false;
      if (willBeSkipped(videoId)) return false;
      return runnableCount() >= BATCH_MAX_RUNNABLE_ITEMS;
    },
    selectUpToQuota() {
      let runnable = runnableCount();
      let hitCap = false;
      // Already-saved videos are checked freely (skipped at execution,
      // no quota); unsaved ones fill the remaining quota, in page order.
      for (const video of knownVideos.values()) {
        if (selectedVideoIds.has(video.videoId)) continue;
        if (willBeSkipped(video.videoId)) {
          selectedVideoIds.add(video.videoId);
        } else if (runnable < BATCH_MAX_RUNNABLE_ITEMS) {
          selectedVideoIds.add(video.videoId);
          runnable += 1;
        } else {
          hitCap = true;
        }
      }
      return hitCap;
    },
    clearSelection() {
      selectedVideoIds.clear();
    },
    counterText,
    counterFull() {
      return runnableCount() >= BATCH_MAX_RUNNABLE_ITEMS;
    },
    savedInfo(videoId) {
      return savedInfo.get(videoId);
    },
    videoIds() {
      return [...knownVideos.keys()];
    },
    clear() {
      knownVideos.clear();
      selectedVideoIds.clear();
      savedInfo.clear();
    },
  };
}
