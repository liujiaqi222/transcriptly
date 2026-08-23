import { doneItemCount, failedItemCount } from "@/batch/eta";
import type { BatchTask } from "@/batch/jobs";

interface BatchActivityProps {
  task: BatchTask;
  onOpenManager(taskId: string): void;
}

/**
 * Popup entry to the batch manager page (#58): whenever a batch is
 * running or paused, the popup shows its live progress and a way back
 * into the manager - the closed playlist page no longer strands an
 * unfinished batch. The exact resume semantics are a separate ticket;
 * this entry only surfaces state and opens the manager.
 */
export function BatchActivity({ task, onOpenManager }: BatchActivityProps) {
  const paused = task.state === "paused";
  const failed = failedItemCount(task);
  const summary = `${doneItemCount(task)}/${task.items.length} done${
    failed > 0 ? ` · ${failed} failed` : ""
  }`;
  return (
    <section className="batch-activity" role="status">
      <p>
        {paused
          ? `Paused batch · ${summary} - waiting to be resumed`
          : `Batch capture in progress · ${summary}`}
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
