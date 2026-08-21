import type { SavedItemDetail } from "./queries";

/** Mirrors the extension's Markdown timestamp format: M:SS / H:MM:SS. */
export function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Standard YouTube deep link to a position, in whole seconds. */
export function timestampUrl(sourceUrl: string, seconds: number): string {
  return `${sourceUrl}&t=${seconds}s`;
}

export type TranscriptBlock =
  | { kind: "chapter"; title: string }
  | { kind: "segment"; start: number; text: string };

/**
 * Interleaves ordered Chapters before the first Segment at or after their
 * start time; trailing chapters after the last Segment are dropped. Same
 * rule as the extension's Markdown serialization.
 */
export function transcriptBlocks({
  segments,
  chapters,
}: Pick<SavedItemDetail, "segments" | "chapters">): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let chapterIndex = 0;

  for (const segment of segments) {
    while (chapterIndex < chapters.length) {
      const chapter = chapters[chapterIndex];
      if (chapter === undefined || chapter.start > segment.start) break;
      blocks.push({ kind: "chapter", title: chapter.title });
      chapterIndex += 1;
    }
    blocks.push({ kind: "segment", start: segment.start, text: segment.text });
  }

  return blocks;
}
