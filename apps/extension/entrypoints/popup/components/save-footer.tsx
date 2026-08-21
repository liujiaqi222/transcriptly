import type { LocalMarkdownSaver } from "@/local-save";

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
  onCloudToggle,
  onSave,
  onChangeFolder,
}: SaveFooterProps) {
  return (
    <footer className="footer">
      <label className="toggle">
        <input type="checkbox" checked disabled readOnly /> Local
      </label>
      <p className="save-to">
        Save to:{" "}
        <span className="directory">
          {directoryName ?? (saver ? "No folder selected" : "…")}
        </span>{" "}
        <button
          type="button"
          className="link"
          onClick={onChangeFolder}
          disabled={!saver || changingFolder}
        >
          {changingFolder ? "Changing…" : "Change"}
        </button>
      </p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={cloudEnabled}
          disabled={!cloudAvailable}
          onChange={(event) => onCloudToggle(event.target.checked)}
        />{" "}
        Cloud
      </label>
      <p className="cloud">
        {cloudAvailable
          ? "Save a copy to your private cloud library"
          : "Sign in to save to cloud"}
      </p>
      {saverError && (
        <p className="error-banner" role="alert">
          {saverError}
        </p>
      )}
      <button
        type="button"
        className="save-button"
        onClick={onSave}
        disabled={saveState.status === "saving" || !saver}
      >
        {saveState.status === "saving" ? "Saving…" : "Save"}
      </button>
    </footer>
  );
}
