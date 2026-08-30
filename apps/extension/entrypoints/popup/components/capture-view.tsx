import type { MarkdownFormat } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";
import { CaptureProperties } from "./capture-properties";
import type { SaveState } from "./save-footer";
import { TranscriptPreview } from "./transcript-preview";

interface CaptureViewProps {
  capture: Capture;
  filename: string;
  saveState: SaveState;
  markdownFormat: MarkdownFormat;
  localEnabled: boolean;
  onFilenameChange(filename: string): void;
  onMarkdownFormatChange(format: MarkdownFormat): void;
}

export function CaptureView({
  capture,
  filename,
  saveState,
  markdownFormat,
  localEnabled,
  onFilenameChange,
  onMarkdownFormatChange,
}: CaptureViewProps) {
  return (
    <>
      <div className="capture-meta">
        <div className="field-group">
          <label className="field-label" htmlFor="filename">
            File name
          </label>
          <input
            id="filename"
            className={
              saveState.status === "saved" ? "filename saved" : "filename"
            }
            value={filename}
            onChange={(event) => onFilenameChange(event.target.value)}
            spellCheck={false}
          />
        </div>
        <CaptureProperties capture={capture} />
      </div>

      <TranscriptPreview
        capture={capture}
        markdownFormat={markdownFormat}
        localEnabled={localEnabled}
        onMarkdownFormatChange={onMarkdownFormatChange}
      />

      {saveState.status === "saved" && (
        <p className="success-banner" role="status">
          Saved to {saveState.directoryName}/{saveState.filename}
        </p>
      )}
      {saveState.status === "error" && (
        <p className="error-banner" role="alert">
          {saveState.message}
        </p>
      )}
    </>
  );
}
