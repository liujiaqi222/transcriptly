import type { LocalMarkdownSaver } from "@/local-save";

interface BatchSourceViewProps {
  saver?: LocalMarkdownSaver;
  saverError?: string;
  directoryName?: string;
  changingFolder: boolean;
  /** undefined while the permission state is still being read. */
  folderReady?: boolean;
  onChangeFolder(): void;
}

/**
 * Shown on playlist / channel pages (#26): single-video capture is not
 * offered, but the folder picker stays available - re-granting folder
 * access here is the only way to restore the background worker's write
 * permission after Chrome dropped it.
 */
export function BatchSourceView({
  saver,
  saverError,
  directoryName,
  changingFolder,
  folderReady,
  onChangeFolder,
}: BatchSourceViewProps) {
  return (
    <section className="batch-source" role="status">
      <p>Select videos using the Transcriptly batch panel on this page.</p>
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
      {saverError && (
        <p className="error-banner" role="alert">
          {saverError}
        </p>
      )}
      {directoryName && folderReady === false && (
        <p className="error-banner" role="alert">
          Write access is not active for this session. You can re-select the
          folder now, or just start the batch - the Transcriptly save page will
          open and ask for access with one click.
        </p>
      )}
      {!directoryName && saver && (
        <p className="cloud">
          Pick a folder before starting a local batch save.
        </p>
      )}
    </section>
  );
}
