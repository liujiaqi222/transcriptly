import type { MarkdownFormat } from "@transcriptly/capture";
import { ArrowRight, Folder, LibraryBig, ListVideo } from "lucide-react";
import type { LocalMarkdownSaver } from "@/local-save";
import { MarkdownFormatPicker } from "./markdown-format-picker";

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
  markdownFormat: MarkdownFormat;
  onMarkdownFormatChange(format: MarkdownFormat): void;
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
  markdownFormat,
  onMarkdownFormatChange,
  onEnterSelection,
  onChangeFolder,
}: BatchSourceViewProps) {
  return (
    <section className="batch-source" role="status">
      <div className="batch-heading">
        <div className="batch-title">
          <LibraryBig />
          <h2>Select videos from this page</h2>
        </div>
        <p className="state-copy">
          Choose up to 50 videos, then save their transcripts together.
        </p>
      </div>
      <div className="destination-summary">
        <Folder />
        <span>
          <span className="destination-label">Save to:</span>
          <strong className="directory">
            {directoryName ?? (saver ? "No folder selected" : "…")}
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
      <button
        type="button"
        className="save-button batch-primary-button"
        onClick={onEnterSelection}
        disabled={enteringSelection}
      >
        {enteringSelection
          ? "Enabling selection…"
          : "Select videos on this page"}
        {!enteringSelection && <ArrowRight />}
      </button>
      {enterError && (
        <p className="error-banner" role="alert">
          {enterError}
        </p>
      )}
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
export function ChannelRootHint({
  opening,
  error,
  onOpenVideos,
}: {
  opening: boolean;
  error?: string;
  onOpenVideos(): void;
}) {
  return (
    <section className="batch-source" role="status">
      <div className="batch-heading">
        <div className="batch-title">
          <LibraryBig />
          <h2>Continue on the Videos tab</h2>
        </div>
        <p className="state-copy">
          Transcriptly can add selection controls once the channel's video grid
          is open.
        </p>
      </div>
      <button
        type="button"
        className="save-button batch-primary-button"
        disabled={opening}
        onClick={onOpenVideos}
      >
        {opening ? "Opening Videos…" : "Open Videos tab"}
        {!opening && <ArrowRight />}
      </button>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * Shown on a watch page that is playing inside a playlist (#69): batch
 * selection only runs on the pure /playlist page, so this quiet strip
 * above the capture view offers the jump. It stays secondary - saving
 * the current video remains that view's primary action - and the
 * capture preview below keeps working either way.
 */
export function PlaylistBatchHint({
  opening,
  error,
  onOpenPlaylist,
}: {
  opening: boolean;
  error?: string;
  onOpenPlaylist(): void;
}) {
  return (
    <section className="playlist-hint" role="status">
      <div className="playlist-hint-message">
        <ListVideo aria-hidden="true" />
        <p>
          This video is part of a playlist. Batch selection runs on the playlist
          page.
        </p>
      </div>
      <div className="playlist-hint-actions">
        <button
          type="button"
          className="playlist-hint-button"
          disabled={opening}
          onClick={onOpenPlaylist}
        >
          {opening ? "Opening playlist…" : "Open playlist page"}
          {!opening && <ArrowRight />}
        </button>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
