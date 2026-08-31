import { ArrowRight, LibraryBig, ListVideo } from "lucide-react";

interface BatchSourceViewProps {
  /** true while the content script is being asked to enter selection mode. */
  enteringSelection: boolean;
  /** Refusal from the content script, or a transport error. */
  enterError?: string;
  onEnterSelection(): void;
}

/**
 * Shown on playlist / channel /videos pages (#26, #56): selection mode is
 * injected on demand - the button asks the tab's content script to add
 * the checkboxes and selection panel. Destination, format and folder
 * permission decisions belong to the Manager setup view (#102).
 */
export function BatchSourceView({
  enteringSelection,
  enterError,
  onEnterSelection,
}: BatchSourceViewProps) {
  return (
    <section className="batch-source" role="status">
      <div className="batch-heading">
        <div className="batch-title">
          <LibraryBig />
          <h2>Select videos from this page</h2>
        </div>
        <p className="state-copy">
          Choose videos here, then configure and start the batch in
          Transcriptly.
        </p>
      </div>
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
