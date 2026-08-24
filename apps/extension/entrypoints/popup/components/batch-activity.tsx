import {
  doneItemCount,
  failedItemCount,
  isFinishingCurrentVideo,
} from "@/batch/eta";
import type { BatchTask } from "@/batch/jobs";

interface BatchActivityProps {
  task: BatchTask;
  /** Saved local folder name, for the permission-paused copy (#59). */
  directoryName?: string;
  onOpenManager(taskId: string): void;
  onResume(taskId: string): void;
}

/**
 * Popup entry to the batch manager page (#58, #59): whenever a batch is
 * running or paused, the popup shows its live progress and a way back
 * into the manager - the closed playlist page no longer strands an
 * unfinished batch. A paused batch shows why (from the persisted
 * `pauseReason`, never guessed): a Continue entry after a browser
 * restart, and a manager jump for folder authorization.
 */
export function BatchActivity({
  task,
  directoryName,
  onOpenManager,
  onResume,
}: BatchActivityProps) {
  const failed = failedItemCount(task);
  const summary = `${doneItemCount(task)}/${task.items.length} done${
    failed > 0 ? ` · ${failed} failed` : ""
  }`;

  if (task.state === "paused") {
    const reason = task.pauseReason;
    if (reason === "browser-restart") {
      return (
        <section className="batch-activity" role="status">
          <p>{`The browser restarted and paused this batch · ${summary}`}</p>
          <button
            type="button"
            className="save-button"
            onClick={() => onResume(task.id)}
          >
            Continue batch
          </button>
          <button
            type="button"
            className="save-button secondary"
            onClick={() => onOpenManager(task.id)}
          >
            Open batch manager
          </button>
        </section>
      );
    }
    if (reason === "local-permission") {
      return (
        <section className="batch-activity" role="status">
          <p>{`Paused - Transcriptly needs access to ${
            directoryName ? `the folder "${directoryName}"` : "a save folder"
          } · ${summary}`}</p>
          <button
            type="button"
            className="save-button"
            onClick={() => onOpenManager(task.id)}
          >
            Grant access in manager
          </button>
        </section>
      );
    }
    if (reason === "local-save-unavailable") {
      return (
        <section className="batch-activity" role="status">
          <p>{`Paused - the manager page lost contact with the local save host · ${summary}`}</p>
          <button
            type="button"
            className="save-button"
            onClick={() => onOpenManager(task.id)}
          >
            Open batch manager
          </button>
        </section>
      );
    }
    return (
      <section className="batch-activity" role="status">
        <p>
          {isFinishingCurrentVideo(task)
            ? `Pausing - finishing the current video · ${summary}`
            : `Paused batch · ${summary} - waiting to be resumed`}
        </p>
        <button
          type="button"
          className="save-button"
          onClick={() => onOpenManager(task.id)}
        >
          Open batch manager
        </button>
      </section>
    );
  }

  return (
    <section className="batch-activity" role="status">
      <p>{`Batch capture in progress · ${summary}`}</p>
      <button
        type="button"
        className="save-button"
        onClick={() => onOpenManager(task.id)}
      >
        Open batch manager
      </button>
    </section>
  );
}
