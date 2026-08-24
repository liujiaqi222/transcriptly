import type { Capture } from "@transcriptly/schema";
import { CaptureProperties } from "./capture-properties";
import type { SaveState } from "./save-footer";
import { TranscriptPreview } from "./transcript-preview";

interface CaptureViewProps {
  capture: Capture;
  filename: string;
  saveState: SaveState;
  onFilenameChange(filename: string): void;
}

export function CaptureView({
  capture,
  filename,
  saveState,
  onFilenameChange,
}: CaptureViewProps) {
  return (
    <>
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
      <TranscriptPreview capture={capture} />

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
