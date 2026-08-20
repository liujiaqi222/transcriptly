import { formatTimestamp, transcriptBlocks } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import type { ReactNode } from "react";
import { segmentUrl } from "@/entrypoints/popup/utils";

function transcriptRows(capture: Capture): ReactNode[] {
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

export function TranscriptPreview({ capture }: { capture: Capture }) {
  return (
    <section className="preview" aria-label="Transcript preview">
      {capture.source.description.trim().length > 0 && (
        <blockquote className="description">
          {capture.source.description.split("\n").map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: description lines are positional
            <p key={index}>{line}</p>
          ))}
        </blockquote>
      )}
      <h2>Transcript</h2>
      {transcriptRows(capture)}
    </section>
  );
}
