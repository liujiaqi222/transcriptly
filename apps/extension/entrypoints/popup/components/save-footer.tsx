import type { MarkdownFormat } from "@transcriptly/capture";
import { Cloud, Folder, Save } from "lucide-react";
import type { LocalMarkdownSaver } from "@/local-save";
import { MarkdownFormatPicker } from "./markdown-format-picker";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; directoryName: string; filename: string }
  | { status: "error"; message: string };

interface SaveFooterProps {
  saver?: LocalMarkdownSaver;
  saverError?: string;
  directoryName?: string;
  changingFolder: boolean;
  saveState: SaveState;
  /** Cloud destination toggle (#35): only offered to signed-in users. */
  cloudEnabled: boolean;
  cloudAvailable: boolean;
  markdownFormat: MarkdownFormat;
  onMarkdownFormatChange(format: MarkdownFormat): void;
  onCloudToggle(enabled: boolean): void;
  onSave(): void;
  onChangeFolder(): void;
}

export function SaveFooter({
  saver,
  saverError,
  directoryName,
  changingFolder,
  saveState,
  cloudEnabled,
  cloudAvailable,
  markdownFormat,
  onMarkdownFormatChange,
  onCloudToggle,
  onSave,
  onChangeFolder,
}: SaveFooterProps) {
  return (
    <footer className="footer">
      <div className="footer-topline">
        <span className="save-target">
          <Folder />
          <span className="save-to">Save to:</span>
          <strong title={directoryName}>
            {directoryName ?? (saver ? "No folder" : "Loading…")}
          </strong>
        </span>
        <button
          type="button"
          className="link"
          onClick={onChangeFolder}
          disabled={!saver || changingFolder}
        >
          {changingFolder ? "Changing…" : "Change"}
        </button>
      </div>
      <MarkdownFormatPicker
        value={markdownFormat}
        onChange={onMarkdownFormatChange}
      />
      <div className="footer-actions">
        <div className="destination-toggles">
          <label className="toggle">
            <input
              type="checkbox"
              aria-label="Local"
              checked
              disabled
              readOnly
            />
            <span>Local</span>
          </label>
          <label
            className="toggle"
            title={!cloudAvailable ? "Sign in to save to cloud" : undefined}
          >
            <input
              type="checkbox"
              aria-label="Cloud"
              checked={cloudEnabled}
              disabled={!cloudAvailable}
              onChange={(event) => onCloudToggle(event.target.checked)}
            />
            <Cloud />
            <span>Cloud</span>
            {!cloudAvailable && (
              <span className="sr-only">Sign in to save to cloud</span>
            )}
          </label>
        </div>
        <button
          type="button"
          className="save-button"
          onClick={onSave}
          disabled={saveState.status === "saving" || !saver}
        >
          <Save />
          {saveState.status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
      {saverError && (
        <p className="error-banner" role="alert">
          {saverError}
        </p>
      )}
    </footer>
  );
}
