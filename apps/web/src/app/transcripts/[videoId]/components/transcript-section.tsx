"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  buildTermPattern,
  Highlight,
  queryTerms,
} from "@/app/transcripts/components/highlight";
import type { TranscriptTimeline } from "@/lib/captures/transcript";
import {
  articleBlocks,
  formatTimestamp,
  timestampUrl,
  transcriptBlocks,
} from "@/lib/captures/transcript";

/** Same two view modes as the extension popup's preview picker. */
type TranscriptFormat = "timeline" | "article";

const FORMATS: { value: TranscriptFormat; label: string }[] = [
  { value: "timeline", label: "Timeline" },
  { value: "article", label: "Article" },
];

/** Anchors the scroll-to-hit lookup in both formats. */
const HIT_ELEMENT_ID = "transcript-hit";

function transcriptCopyText(
  timeline: TranscriptTimeline,
  format: TranscriptFormat,
): string {
  const blocks =
    format === "article" ? articleBlocks(timeline) : transcriptBlocks(timeline);
  return blocks
    .map((block) =>
      block.kind === "chapter"
        ? block.title
        : `[${formatTimestamp(block.start)}] ${block.text}`,
    )
    .join("\n");
}

/**
 * The public transcript reader: a Timeline/Article toggle and a one-click
 * copy, mirroring the extension popup's preview. Timeline keeps one caption
 * row per segment; Article reflows the same text into paragraphs whose first
 * timestamp links back into the video.
 */
export function TranscriptSection({
  url,
  segments,
  chapters,
  query,
  hitStart,
}: {
  url: string;
  segments: TranscriptTimeline["segments"];
  chapters: TranscriptTimeline["chapters"];
  /** Query terms carried from the search results, marked in the text. */
  query?: string;
  /** Whole-second start of the hit segment, scrolled into view once. */
  hitStart?: number;
}) {
  const timeline: TranscriptTimeline = { segments, chapters };
  const [format, setFormat] = useState<TranscriptFormat>("timeline");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  const termPattern = useMemo(
    () => buildTermPattern(queryTerms(query ?? "")),
    [query],
  );

  const blocks =
    format === "article" ? articleBlocks(timeline) : transcriptBlocks(timeline);

  // The search hit anchors scrolling: the block starting at hitStart, or -
  // when the article format reflowed that segment into an earlier paragraph -
  // the first block carrying a marked term.
  const hasExactHit =
    hitStart !== undefined &&
    blocks.some(
      (block) => block.kind !== "chapter" && block.start === hitStart,
    );
  let firstMarkSpent = false;

  // Fires when the hit element mounts, including after a format toggle
  // re-creates it, so no effect bookkeeping is needed.
  const scrollHitIntoView = useCallback((element: HTMLElement | null) => {
    if (element !== null) element.scrollIntoView({ block: "center" });
  }, []);

  const isHitBlock = (start: number, text: string): boolean => {
    if (hitStart === undefined) return false;
    if (start === hitStart) return true;
    if (hasExactHit || firstMarkSpent || termPattern === null) return false;
    if (!termPattern.test(text)) return false;
    firstMarkSpent = true;
    return true;
  };

  const copyTranscript = async () => {
    await navigator.clipboard.writeText(transcriptCopyText(timeline, format));
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section
      className="mt-18 border-t border-[#e2e8f0] pt-8"
      aria-labelledby="transcript-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <h2
            className="m-0 font-serif text-3xl font-semibold tracking-[-0.02em]"
            id="transcript-title"
          >
            Transcript
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <fieldset className="m-0 border-0 p-0">
            <legend className="sr-only">Transcript format</legend>
            <div className="inline-flex rounded-[10px] border border-[#e2e8f0] bg-white p-0.5">
              {FORMATS.map(({ value, label }) => (
                <button
                  aria-pressed={format === value}
                  className={
                    format === value
                      ? "rounded-lg bg-[#202124] px-3 py-1.5 text-sm font-bold text-white transition-colors focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
                      : "rounded-lg px-3 py-1.5 text-sm font-bold text-[#64748b] transition-colors hover:text-[#202124] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
                  }
                  key={value}
                  onClick={() => setFormat(value)}
                  title={
                    value === "article"
                      ? "Reflowed paragraphs with start timestamps"
                      : "Timestamped caption lines"
                  }
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            aria-label={
              copied
                ? "Transcript copied"
                : `Copy ${format === "article" ? "Article" : "Timeline"} transcript`
            }
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#e2e8f0] bg-white text-[#64748b] transition-colors hover:border-[#cbd5e1] hover:text-[#202124] focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
            onClick={() => void copyTranscript()}
            title="Copy transcript"
            type="button"
          >
            {copied ? (
              <Check aria-hidden="true" className="text-green-700" size={16} />
            ) : (
              <Copy aria-hidden="true" size={16} />
            )}
          </button>
        </div>
      </div>
      {format === "article" ? (
        <div className="mt-7">
          {blocks.map((block) => {
            if (block.kind === "chapter") {
              return (
                <h3
                  className="mt-10 mb-2 text-xl font-bold"
                  key={`chapter-${block.title}`}
                >
                  {block.title}
                </h3>
              );
            }
            const isHit = isHitBlock(block.start, block.text);
            return (
              <p
                className="-mx-3 m-0 rounded-lg px-3 py-1.5 leading-7 transition-colors hover:bg-white max-sm:-mx-2 max-sm:px-2"
                id={isHit ? HIT_ELEMENT_ID : undefined}
                key={`paragraph-${block.start}-${block.text}`}
                ref={isHit ? scrollHitIntoView : undefined}
              >
                <a
                  className="mr-3 inline-block font-mono text-sm text-[#0872b9] tabular-nums underline-offset-4 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
                  href={timestampUrl(url, block.start)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {formatTimestamp(block.start)}
                </a>
                <Highlight pattern={termPattern} text={block.text} />
              </p>
            );
          })}
        </div>
      ) : (
        <ol className="mt-7 mb-0 list-none p-0">
          {blocks.map((block) => {
            if (block.kind === "chapter") {
              return (
                <li key={`chapter-${block.title}`}>
                  <h3 className="mt-10 mb-2 text-xl font-bold">
                    {block.title}
                  </h3>
                </li>
              );
            }
            const isHit = isHitBlock(block.start, block.text);
            return (
              <li
                className="-mx-3 grid grid-cols-[64px_minmax(0,1fr)] gap-4 rounded-lg px-3 py-1.5 leading-7 transition-colors hover:bg-white max-sm:-mx-2 max-sm:grid-cols-[52px_minmax(0,1fr)] max-sm:gap-3 max-sm:px-2"
                id={isHit ? HIT_ELEMENT_ID : undefined}
                key={`segment-${block.start}-${block.text}`}
                ref={isHit ? scrollHitIntoView : undefined}
              >
                <a
                  className="font-mono text-sm leading-7 text-[#0872b9] tabular-nums underline-offset-4 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40 max-sm:text-xs"
                  href={timestampUrl(url, block.start)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {formatTimestamp(block.start)}
                </a>
                <Highlight pattern={termPattern} text={block.text} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
