import type { Capture } from "@transcriptly/schema";
import type { LocalMarkdownSaver } from "@/local-save";
import { CaptureProperties } from "./capture-properties";
import { SaveFooter, type SaveState } from "./save-footer";
import { TranscriptPreview } from "./transcript-preview";

interface CaptureViewProps {
  capture: Capture;
  filename: string;
  saver?: LocalMarkdownSaver;
  saverError?: string;
  directoryName?: string;
  changingFolder: boolean;
  saveState: SaveState;
  cloudEnabled: boolean;
  cloudAvailable: boolean;
  onCloudToggle(enabled: boolean): void;
  onFilenameChange(filename: string): void;
  onSave(): void;
  onChangeFolder(): void;
}

export function CaptureView({
  capture,
  filename,
  saver,
  saverError,
  directoryName,
  changingFolder,
  saveState,
  cloudEnabled,
  cloudAvailable,
  onCloudToggle,
  onFilenameChange,
  onSave,
  onChangeFolder,
}: CaptureViewProps) {
  return (
    <>
      <label className="field-label" htmlFor="filename">
        File name
      </label>
      <input
        id="filename"
        className={saveState.status === "saved" ? "filename saved" : "filename"}
        value={filename}
        onChange={(event) => onFilenameChange(event.target.value)}
        spellCheck={false}
      />

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

      <SaveFooter
        saver={saver}
        saverError={saverError}
        directoryName={directoryName}
        changingFolder={changingFolder}
        saveState={saveState}
        cloudEnabled={cloudEnabled}
        cloudAvailable={cloudAvailable}
        onCloudToggle={onCloudToggle}
        onSave={onSave}
        onChangeFolder={onChangeFolder}
      />
    </>
  );
}
