import {
  articleBlocks,
  formatTimestamp,
  type MarkdownFormat,
  transcriptBlocks,
} from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { segmentUrl } from "@/entrypoints/popup/utils";
import { MarkdownFormatPicker } from "./markdown-format-picker";

function timelineRows(capture: Capture): ReactNode[] {
  return transcriptBlocks(capture).map((block) => {
    if (block.kind === "chapter") {
      return (
        <h4 className="chapter" key={`chapter-${block.title}`}>
          {block.title}
        </h4>
      );
    }

    return (
      <p className="segment" key={`segment-${block.start}`}>
        [
        <a href={segmentUrl(capture.source.videoId, block.start)}>
          {formatTimestamp(block.start)}
        </a>
        ] {block.text}
      </p>
    );
  });
}

/** Article view mirrors the saved file: reflowed paragraphs whose first
 *  timestamp links back into the video. */
function articleRows(capture: Capture): ReactNode[] {
  return articleBlocks(capture).map((block) => {
    if (block.kind === "chapter") {
      return (
        <h4 className="chapter" key={`chapter-${block.title}`}>
          {block.title}
        </h4>
      );
    }

    return (
      <p className="segment" key={`paragraph-${block.start}`}>
        [
        <a href={segmentUrl(capture.source.videoId, block.start)}>
          {formatTimestamp(block.start)}
        </a>
        ] {block.text}
      </p>
    );
  });
}

interface TranscriptPreviewProps {
  capture: Capture;
  markdownFormat: MarkdownFormat;
  localEnabled: boolean;
  onMarkdownFormatChange(format: MarkdownFormat): void;
}

function transcriptCopyText(
  capture: Capture,
  markdownFormat: MarkdownFormat,
): string {
  const blocks =
    markdownFormat === "article"
      ? articleBlocks(capture)
      : transcriptBlocks(capture);
  return blocks
    .map((block) =>
      block.kind === "chapter"
        ? block.title
        : `[${formatTimestamp(block.start)}] ${block.text}`,
    )
    .join("\n");
}

export function TranscriptPreview({
  capture,
  markdownFormat,
  localEnabled,
  onMarkdownFormatChange,
}: TranscriptPreviewProps) {
  const [copied, setCopied] = useState(false);

  const copyTranscript = async () => {
    await navigator.clipboard.writeText(
      transcriptCopyText(capture, markdownFormat),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="preview" aria-label="Transcript preview">
      <div className="preview-heading">
        <h2>Transcript</h2>
        <div className="preview-actions">
          {localEnabled && (
            <MarkdownFormatPicker
              value={markdownFormat}
              onChange={onMarkdownFormatChange}
            />
          )}
          <button
            type="button"
            className={copied ? "copy-button copied" : "copy-button"}
            onClick={copyTranscript}
            title="Copy transcript"
            aria-label={
              copied
                ? "Transcript copied"
                : `Copy ${markdownFormat === "article" ? "Article" : "Timeline"} transcript`
            }
          >
            {copied ? <Check /> : <Copy />}
          </button>
        </div>
      </div>
      {markdownFormat === "article"
        ? articleRows(capture)
        : timelineRows(capture)}
    </section>
  );
}
