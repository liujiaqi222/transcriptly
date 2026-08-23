import type { LocalMarkdownSaver } from "@/local-save";

interface BatchSourceViewProps {
  saver?: LocalMarkdownSaver;
  saverError?: string;
  directoryName?: string;
  changingFolder: boolean;
  /** undefined while the permission state is still being read. */
  folderReady?: boolean;
  /** true while the content script is being asked to enter selection mode. */
  enteringSelection: boolean;
  /** Refusal from the content script, or a transport error. */
  enterError?: string;
  onEnterSelection(): void;
  onChangeFolder(): void;
}

/**
 * Shown on playlist / channel /videos pages (#26, #56): selection mode is
 * injected on demand - the button asks the tab's content script to add
 * the checkboxes and the batch panel. The folder picker stays available -
 * re-granting folder access here is the only way to restore the
 * background worker's write permission after Chrome dropped it.
 */
export function BatchSourceView({
  saver,
  saverError,
  directoryName,
  changingFolder,
  folderReady,
  enteringSelection,
  enterError,
  onEnterSelection,
  onChangeFolder,
}: BatchSourceViewProps) {
  return (
    <section className="batch-source" role="status">
      <p>Select videos on this page for a batch transcript save.</p>
      <button
        type="button"
        className="save-button"
        onClick={onEnterSelection}
        disabled={enteringSelection}
      >
        {enteringSelection
          ? "Enabling selection…"
          : "Select videos on this page"}
      </button>
      {enterError && (
        <p className="error-banner" role="alert">
          {enterError}
        </p>
      )}
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

/**
 * Shown on a channel root page (#56): no video cards to select here, so
 * the former on-page guide overlay became a popup hint pointing at the
 * channel's Videos tab.
 */
export function ChannelRootHint() {
  return (
    <section className="batch-source" role="status">
      <p>Open this channel's Videos tab to select videos for a batch save.</p>
    </section>
  );
}
