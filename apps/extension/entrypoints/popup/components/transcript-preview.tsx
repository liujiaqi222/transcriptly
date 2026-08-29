import { formatTimestamp, transcriptBlocks } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
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
  const [copied, setCopied] = useState(false);

  const copyTranscript = async () => {
    const text = transcriptBlocks(capture)
      .map((block) =>
        block.kind === "chapter"
          ? block.title
          : `[${formatTimestamp(block.start)}] ${block.text}`,
      )
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="preview" aria-label="Transcript preview">
      <div className="preview-heading">
        <h2>Transcript</h2>
        <button
          type="button"
          className={copied ? "copy-button copied" : "copy-button"}
          onClick={copyTranscript}
          title="Copy transcript"
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {transcriptRows(capture)}
    </section>
  );
}
