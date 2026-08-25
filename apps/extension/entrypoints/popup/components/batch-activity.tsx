import type { ReactNode } from "react";
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
 *
 * Every variant renders as one slim strip - the message, then a single
 * row of inline actions - so the entry never crowds out the capture
 * view it sits above.
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
  const managerLink = (
    <button
      type="button"
      className="batch-activity-link"
      onClick={() => onOpenManager(task.id)}
    >
      Open batch manager
    </button>
  );

  let message: string;
  let actions: ReactNode;
  if (task.state !== "paused") {
    message = `Batch capture in progress · ${summary}`;
    actions = managerLink;
  } else if (task.pauseReason === "browser-restart") {
    message = `The browser restarted and paused this batch · ${summary}`;
    actions = (
      <>
        <button
          type="button"
          className="save-button"
          onClick={() => onResume(task.id)}
        >
          Continue batch
        </button>
        {managerLink}
      </>
    );
  } else if (task.pauseReason === "local-permission") {
    message = `Paused - Transcriptly needs access to ${
      directoryName ? `the folder "${directoryName}"` : "a save folder"
    } · ${summary}`;
    actions = (
      <button
        type="button"
        className="save-button"
        onClick={() => onOpenManager(task.id)}
      >
        Grant access in manager
      </button>
    );
  } else if (task.pauseReason === "local-save-unavailable") {
    message = `Paused - the manager page lost contact with the local save host · ${summary}`;
    actions = managerLink;
  } else if (isFinishingCurrentVideo(task)) {
    message = `Pausing - finishing the current video · ${summary}`;
    actions = managerLink;
  } else {
    message = `Paused batch · ${summary} - waiting to be resumed`;
    actions = managerLink;
  }

  return (
    <section className="batch-activity" role="status">
      <p>{message}</p>
      <div className="batch-activity-actions">{actions}</div>
    </section>
  );
}
