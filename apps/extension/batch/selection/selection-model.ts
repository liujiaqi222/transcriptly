import type { BatchVideo } from "@/batch/jobs";

/**
 * Pure selection state for the on-page batch toolbar (#57).
 *
 * Tracks which videos the feed currently shows and which are selected, then
 * derives the selected-count / ETA summary and select-all behaviour. Existing
 * save receipts are deliberately not represented here: selection mode treats
 * every card uniformly and the worker re-checks receipts when the task starts.
 */

/** Planning estimate for one video's capture + save. */
const SECONDS_PER_VIDEO = 15;
const LARGE_BATCH_THRESHOLD = 100;

function estimatedMinutes(videos: number): number {
  return Math.max(1, Math.ceil((videos * SECONDS_PER_VIDEO) / 60));
}

export interface SelectionModel {
  /** Registers currently loaded videos; returns ids never seen before. */
  ingest(videos: BatchVideo[]): string[];
  isChecked(videoId: string): boolean;
  setChecked(videoId: string, checked: boolean): void;
  /** Selected videos in selection order, for BATCH_START. */
  checkedVideos(): BatchVideo[];
  /** Checks every currently loaded video in page order. */
  selectAll(): void;
  clearSelection(): void;
  counterText(): string;
  /** Discovered video ids, in page order. */
  videoIds(): string[];
  /** Drops everything (new batch source). */
  clear(): void;
}

export function createSelectionModel(): SelectionModel {
  const knownVideos = new Map<string, BatchVideo>();
  const selectedVideoIds = new Set<string>();

  function counterText(): string {
    let text = `${selectedVideoIds.size} selected`;
    if (selectedVideoIds.size > LARGE_BATCH_THRESHOLD) text += " · Large batch";
    if (selectedVideoIds.size > 0) {
      text += ` · ~${estimatedMinutes(selectedVideoIds.size)} min`;
    }
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
    selectAll() {
      for (const video of knownVideos.values()) {
        selectedVideoIds.add(video.videoId);
      }
    },
    clearSelection() {
      selectedVideoIds.clear();
    },
    counterText,
    videoIds() {
      return [...knownVideos.keys()];
    },
    clear() {
      knownVideos.clear();
      selectedVideoIds.clear();
    },
  };
}
