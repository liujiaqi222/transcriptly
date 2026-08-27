import type { MarkdownFormat } from "@transcriptly/capture";
import { Folder, Globe2, Save } from "lucide-react";
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
  publicProfileConfirmed: boolean;
  publicConfirmationAccepted: boolean;
  contributorDisplayName?: string;
  markdownFormat: MarkdownFormat;
  onMarkdownFormatChange(format: MarkdownFormat): void;
  /** Local Markdown destination: on by default, independently togglable (#64). */
  localEnabled: boolean;
  onLocalToggle(enabled: boolean): void;
  onCloudToggle(enabled: boolean): void;
  onPublicConfirmationChange(accepted: boolean): void;
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
  publicProfileConfirmed,
  publicConfirmationAccepted,
  contributorDisplayName,
  markdownFormat,
  onMarkdownFormatChange,
  localEnabled,
  onLocalToggle,
  onCloudToggle,
  onPublicConfirmationChange,
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
      {cloudEnabled && !publicProfileConfirmed && (
        <div className="public-confirmation">
          <p>
            Before your first contribution: this transcript, your display name
            {contributorDisplayName ? ` (${contributorDisplayName})` : ""}, and
            optional avatar will be public. Your email is never shown.
          </p>
          <label>
            <input
              type="checkbox"
              checked={publicConfirmationAccepted}
              onChange={(event) =>
                onPublicConfirmationChange(event.target.checked)
              }
            />
            <span>I understand this contribution will be public</span>
          </label>
        </div>
      )}
      <div className="footer-actions">
        <div className="destination-toggles">
          <label className="toggle">
            <input
              type="checkbox"
              aria-label="Local"
              checked={localEnabled}
              onChange={(event) => onLocalToggle(event.target.checked)}
            />
            <Folder />
            <span>Local</span>
          </label>
          <label
            className="toggle"
            title={
              !cloudAvailable
                ? "Sign in to contribute to the public archive"
                : undefined
            }
          >
            <input
              type="checkbox"
              aria-label="Contribute publicly"
              checked={cloudEnabled}
              disabled={!cloudAvailable}
              onChange={(event) => onCloudToggle(event.target.checked)}
            />
            <Globe2 />
            <span>Contribute publicly</span>
          </label>
          {!cloudAvailable && (
            <span className="sign-in-hint">
              Sign in to contribute to the public archive
            </span>
          )}
        </div>
        <button
          type="button"
          className="save-button"
          onClick={onSave}
          disabled={
            saveState.status === "saving" ||
            // At least one destination must be selected and usable (#64).
            !((localEnabled && saver) || cloudEnabled) ||
            (cloudEnabled &&
              !publicProfileConfirmed &&
              !publicConfirmationAccepted)
          }
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
