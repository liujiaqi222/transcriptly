import { formatTimestamp, transcriptBlocks } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import type { ReactNode } from "react";
import { segmentUrl } from "@/entrypoints/popup/utils";

function transcriptRows(capture: Capture): ReactNode[] {
  return transcriptBlocks(capture).map((block, index) => {
    if (block.kind === "chapter") {
      return (
        <h4 className="chapter" key={`block-${index}`}>
          {block.title}
        </h4>
      );
    }

    return (
      <p className="segment" key={`block-${index}`}>
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
            <p key={index}>{line}</p>
          ))}
        </blockquote>
      )}
      <h2>Transcript</h2>
      {transcriptRows(capture)}
    </section>
  );
}
