"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
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
}: {
  url: string;
  segments: TranscriptTimeline["segments"];
  chapters: TranscriptTimeline["chapters"];
}) {
  const timeline: TranscriptTimeline = { segments, chapters };
  const [format, setFormat] = useState<TranscriptFormat>("timeline");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);

  const copyTranscript = async () => {
    await navigator.clipboard.writeText(transcriptCopyText(timeline, format));
    setCopied(true);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  const blocks =
    format === "article" ? articleBlocks(timeline) : transcriptBlocks(timeline);

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
          {blocks.map((block) =>
            block.kind === "chapter" ? (
              <h3
                className="mt-10 mb-2 text-xl font-bold"
                key={`chapter-${block.title}`}
              >
                {block.title}
              </h3>
            ) : (
              <p
                className="-mx-3 m-0 rounded-lg px-3 py-1.5 leading-7 transition-colors hover:bg-white max-sm:-mx-2 max-sm:px-2"
                key={`paragraph-${block.start}-${block.text}`}
              >
                <a
                  className="mr-3 inline-block font-mono text-sm text-[#0872b9] tabular-nums underline-offset-4 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
                  href={timestampUrl(url, block.start)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {formatTimestamp(block.start)}
                </a>
                {block.text}
              </p>
            ),
          )}
        </div>
      ) : (
        <ol className="mt-7 mb-0 list-none p-0">
          {blocks.map((block) =>
            block.kind === "chapter" ? (
              <li key={`chapter-${block.title}`}>
                <h3 className="mt-10 mb-2 text-xl font-bold">{block.title}</h3>
              </li>
            ) : (
              <li
                className="-mx-3 grid grid-cols-[64px_minmax(0,1fr)] gap-4 rounded-lg px-3 py-1.5 leading-7 transition-colors hover:bg-white max-sm:-mx-2 max-sm:grid-cols-[52px_minmax(0,1fr)] max-sm:gap-3 max-sm:px-2"
                key={`segment-${block.start}-${block.text}`}
              >
                <a
                  className="font-mono text-sm leading-7 text-[#0872b9] tabular-nums underline-offset-4 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40 max-sm:text-xs"
                  href={timestampUrl(url, block.start)}
                  rel="noreferrer"
                  target="_blank"
                >
                  {formatTimestamp(block.start)}
                </a>
                <span>{block.text}</span>
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}
