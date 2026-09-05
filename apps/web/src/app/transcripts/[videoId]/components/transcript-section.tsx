"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Remembers the visitor's last format choice across visits. */
const FORMAT_STORAGE_KEY = "transcriptly:transcript-format";

/** Anchors the scroll-to-hit lookup in both formats. */
const HIT_ELEMENT_ID = "transcript-hit";

/** Stable anchor ids for chapter headings, shared by the TOC links. */
const chapterHeadingId = (index: number) => `transcript-chapter-${index}`;

interface ChapterItem {
  /** Ordinal among the video's chapters; drives the heading anchor id. */
  index: number;
  title: string;
}

function readStoredFormat(): TranscriptFormat | null {
  try {
    const stored = window.localStorage.getItem(FORMAT_STORAGE_KEY);
    return stored === "timeline" || stored === "article" ? stored : null;
  } catch {
    // Private browsing can block localStorage; fall through to the default.
    return null;
  }
}

function persistFormat(format: TranscriptFormat): void {
  try {
    window.localStorage.setItem(FORMAT_STORAGE_KEY, format);
  } catch {
    // Storage failures are non-fatal; the toggle still works for this visit.
  }
}

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

function ChapterTocList({
  items,
  activeChapter,
  onSelect,
}: {
  items: ChapterItem[];
  activeChapter: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {items.map((item) => {
        const active = item.index === activeChapter;
        return (
          <li key={chapterHeadingId(item.index)}>
            <a
              aria-current={active ? "location" : undefined}
              className={
                active
                  ? "flex items-baseline gap-2.5 rounded-lg bg-[#edf7ff] px-2.5 py-2 text-sm font-bold text-[#0872b9] no-underline transition-colors focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
                  : "flex items-baseline gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-[#64748b] no-underline transition-colors hover:bg-[#edf7ff] hover:text-[#202124] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
              }
              href={`#${chapterHeadingId(item.index)}`}
              onClick={(event) => {
                event.preventDefault();
                onSelect(item.index);
              }}
            >
              <span className="min-w-0 flex-1 line-clamp-2 leading-5">
                {item.title}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The public transcript reader: an Article-first Timeline/Article toggle that
 * remembers the visitor's choice, a chapter TOC that tracks the reader's
 * position, and a one-click copy, mirroring the extension popup's preview.
 * Timeline keeps one caption row per segment; Article reflows the same text
 * into paragraphs whose first timestamp links back into the video.
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
  // Article reads best for humans, so it is the default; a stored preference
  // (including "timeline") is restored after hydration.
  const [format, setFormat] = useState<TranscriptFormat>("article");
  const [activeChapter, setActiveChapter] = useState(0);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);
  const termPattern = useMemo(
    () => buildTermPattern(queryTerms(query ?? "")),
    [query],
  );

  useEffect(() => {
    const stored = readStoredFormat();
    if (stored !== null) setFormat(stored);
  }, []);

  const selectFormat = (value: TranscriptFormat) => {
    setFormat(value);
    persistFormat(value);
  };

  const blocks = useMemo(
    () =>
      format === "article"
        ? articleBlocks({ segments, chapters })
        : transcriptBlocks({ segments, chapters }),
    [format, segments, chapters],
  );

  // TOC entries mirror the chapter headings actually rendered in the current
  // format (trailing chapters without segments are dropped by the blocks).
  const chapterItems = useMemo(() => {
    const items: ChapterItem[] = [];
    let ordinal = 0;
    for (const block of blocks) {
      if (block.kind !== "chapter") continue;
      items.push({
        index: ordinal,
        title: block.title,
      });
      ordinal += 1;
    }
    return items;
  }, [blocks]);

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

  const scrollToChapter = useCallback((index: number) => {
    const heading = document.getElementById(chapterHeadingId(index));
    if (heading === null) return;
    const behavior: ScrollBehavior = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
      ? "auto"
      : "smooth";
    heading.scrollIntoView({ behavior, block: "start" });
  }, []);

  // Highlights the chapter whose content the reader is currently in: the last
  // heading that has scrolled past the upper third of the viewport. The
  // observer just triggers recomputation whenever a heading moves.
  useEffect(() => {
    if (chapterItems.length === 0) return;
    const syncActiveChapter = () => {
      const threshold = window.innerHeight * 0.3;
      let active = 0;
      for (const item of chapterItems) {
        const heading = document.getElementById(chapterHeadingId(item.index));
        if (
          heading !== null &&
          heading.getBoundingClientRect().top <= threshold
        ) {
          active = item.index;
        }
      }
      setActiveChapter(active);
    };
    syncActiveChapter();
    const observer = new IntersectionObserver(syncActiveChapter, {
      rootMargin: "0px 0px -70% 0px",
    });
    for (const item of chapterItems) {
      const heading = document.getElementById(chapterHeadingId(item.index));
      if (heading !== null) observer.observe(heading);
    }
    return () => observer.disconnect();
  }, [chapterItems]);

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

  // Counted while the block lists render so heading ids stay in sync with the
  // TOC entries. Only one of the two branches renders per pass.
  let chapterOrdinal = 0;

  return (
    <section
      className="mt-18 border-t border-[#e2e8f0] pt-8"
      aria-labelledby="transcript-title"
    >
      <div className="relative">
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
                    onClick={() => selectFormat(value)}
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
                <Check
                  aria-hidden="true"
                  className="text-green-700"
                  size={16}
                />
              ) : (
                <Copy aria-hidden="true" size={16} />
              )}
            </button>
          </div>
        </div>
        {chapterItems.length > 0 ? (
          <details className="group mt-7 rounded-[10px] border border-[#e2e8f0] bg-white min-[1360px]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-[#202124] marker:content-none [&::-webkit-details-marker]:hidden">
              Chapters
              <span className="flex items-center gap-1.5 text-xs font-bold text-[#64748b]">
                {chapterItems.length}
                <ChevronDown
                  aria-hidden="true"
                  className="transition-transform group-open:rotate-180"
                  size={14}
                />
              </span>
            </summary>
            <div className="max-h-72 overflow-y-auto border-t border-[#e2e8f0] px-2 py-2">
              <ChapterTocList
                activeChapter={activeChapter}
                items={chapterItems}
                onSelect={scrollToChapter}
              />
            </div>
          </details>
        ) : null}
        {chapterItems.length > 0 ? (
          <nav
            aria-label="Chapters"
            className="absolute bottom-0 left-[calc(100%+32px)] top-0 hidden w-[200px] min-[1360px]:block"
          >
            <div className="sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto">
              <p className="m-0 mb-2 px-2.5 text-xs font-extrabold tracking-widest text-[#64748b] uppercase">
                Chapters
              </p>
              <ChapterTocList
                activeChapter={activeChapter}
                items={chapterItems}
                onSelect={scrollToChapter}
              />
            </div>
          </nav>
        ) : null}
        {format === "article" ? (
          <div className="mt-7">
            {blocks.map((block) => {
              if (block.kind === "chapter") {
                const ordinal = chapterOrdinal;
                chapterOrdinal += 1;
                return (
                  <h3
                    className="mt-10 mb-2 scroll-mt-24 text-xl font-bold"
                    id={chapterHeadingId(ordinal)}
                    key={chapterHeadingId(ordinal)}
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
                const ordinal = chapterOrdinal;
                chapterOrdinal += 1;
                return (
                  <li key={chapterHeadingId(ordinal)}>
                    <h3
                      className="mt-10 mb-2 scroll-mt-24 text-xl font-bold"
                      id={chapterHeadingId(ordinal)}
                    >
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
      </div>
    </section>
  );
}
