import { useCallback, useEffect, useState } from "react";
import {
  doneItemCount,
  estimateRemainingSeconds,
  failedItemCount,
  formatDuration,
} from "@/batch/eta";
import type { BatchDestination, BatchItem, BatchTask } from "@/batch/jobs";
import {
  BATCH_PAUSE,
  BATCH_RESUME,
  BATCH_RETRY_ITEM,
  BATCH_STATUS_REQUEST,
  BATCH_STOP,
  type BatchMutationStatus,
  type BatchStatusResult,
} from "@/shared/messages";

/**
 * The batch manager page (#58): everything the 300 px page overlay used
 * to show now lives here - total progress with a sliding ETA, per-video
 * Local / Cloud results with failure reasons and Retry, Pause / Stop /
 * Resume, and the recent-batches history. `?task=<id>` deep-links to one
 * batch; without it the newest batch is shown. State is polled from the
 * background worker, so the page survives closing the YouTube source
 * page and can be re-opened from the popup or the floating capsule.
 */

export interface ManagerDependencies {
  sendMessage<T = unknown>(message: unknown): Promise<T>;
}

const STATUS_POLL_MS = 1000;

const STATE_LABELS: Record<BatchTask["state"], string> = {
  queued: "Running",
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
};

const RETRYABLE_STATES = ["failed", "skipped", "cancelled"];

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function itemState(
  item: BatchItem,
  destination: BatchDestination,
): BatchItem["local"] {
  return destination === "local" ? item.local : item.cloud;
}

function isRetryable(task: BatchTask, item: BatchItem): boolean {
  return task.destinations.some((destination) =>
    RETRYABLE_STATES.includes(itemState(item, destination)),
  );
}

interface BatchTaskDetailProps {
  task: BatchTask;
  mutationError?: string;
  onMutate(message: unknown): void;
}

function BatchTaskDetail({
  task,
  mutationError,
  onMutate,
}: BatchTaskDetailProps) {
  const total = task.items.length;
  const done = doneItemCount(task);
  const failed = failedItemCount(task);
  const etaSeconds = estimateRemainingSeconds(task);
  const active =
    task.state === "running" ||
    task.state === "queued" ||
    task.state === "paused";

  const summary = [
    `${done}/${total} done`,
    ...(failed > 0 ? [`${failed} failed`] : []),
    ...(etaSeconds !== undefined
      ? [`~${formatDuration(etaSeconds)} remaining`]
      : []),
  ].join(" · ");

  const items = task.items.map((item) => {
    const chips = task.destinations.map((destination) => {
      const state = itemState(item, destination);
      return (
        <span key={destination} className={`chip chip-${state}`}>
          {`${destination}: ${state}`}
        </span>
      );
    });
    const errors = task.destinations.map((destination) => {
      const error = destination === "local" ? item.localError : item.cloudError;
      return error ? (
        <p key={destination} className="item-error">
          {`${destination}: ${error}`}
        </p>
      ) : null;
    });
    return (
      <li key={item.video.videoId} className="item">
        <p className="item-title" title={item.video.title}>
          {item.video.title}
        </p>
        <div className="chips">{chips}</div>
        {errors}
        {isRetryable(task, item) && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              onMutate({
                type: BATCH_RETRY_ITEM,
                taskId: task.id,
                videoId: item.video.videoId,
              })
            }
          >
            Retry
          </button>
        )}
      </li>
    );
  });

  return (
    <section className="task-detail">
      <div className="task-head">
        <span className={`state state-${task.state}`}>
          {STATE_LABELS[task.state]}
        </span>
        <span className="task-date">{formatTimestamp(task.createdAt)}</span>
        <span className="task-destinations">
          {task.destinations.join(" + ")}
        </span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${done} of ${total} videos done`}
      >
        <div
          className="progress-fill"
          style={{
            width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%`,
          }}
        />
      </div>
      <p className="summary">{summary}</p>
      {active && (
        <div className="controls">
          {(task.state === "running" || task.state === "queued") && (
            <button
              type="button"
              onClick={() => onMutate({ type: BATCH_PAUSE, taskId: task.id })}
            >
              Pause
            </button>
          )}
          {task.state === "paused" && (
            <button
              type="button"
              onClick={() => onMutate({ type: BATCH_RESUME, taskId: task.id })}
            >
              Resume
            </button>
          )}
          <button
            type="button"
            className="danger"
            onClick={() => onMutate({ type: BATCH_STOP, taskId: task.id })}
          >
            Stop pending items
          </button>
        </div>
      )}
      {mutationError && (
        <p className="error-banner" role="alert">
          {mutationError}
        </p>
      )}
      <p className="hint">
        Keep the browser window in the foreground while a batch runs - each
        video opens in a foreground tab while its transcript is captured, then
        closes automatically.
      </p>
      <ul className="items">{items}</ul>
    </section>
  );
}

export function ManagerApp({
  deps,
  initialTaskId,
}: {
  deps: ManagerDependencies;
  initialTaskId?: string;
}) {
  const [tasks, setTasks] = useState<BatchTask[] | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId);
  const [mutationError, setMutationError] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      const [recentResult, selectedResult] = await Promise.all([
        deps.sendMessage<BatchStatusResult>({
          type: BATCH_STATUS_REQUEST,
        }),
        selectedTaskId
          ? deps.sendMessage<BatchStatusResult>({
              type: BATCH_STATUS_REQUEST,
              taskId: selectedTaskId,
            })
          : Promise.resolve(undefined),
      ]);
      const selectedTask = selectedResult?.tasks[0];
      setTasks(
        selectedTask &&
          !recentResult.tasks.some((task) => task.id === selectedTask.id)
          ? [selectedTask, ...recentResult.tasks]
          : recentResult.tasks,
      );
    } catch {
      // The background worker is unreachable; the next poll retries.
    }
  }, [deps, selectedTaskId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const handleMutate = useCallback(
    async (message: unknown) => {
      try {
        const result = await deps.sendMessage<BatchMutationStatus>(message);
        setMutationError(result.ok ? undefined : result.message);
      } catch (error) {
        setMutationError(
          error instanceof Error ? error.message : String(error),
        );
      }
      await refresh();
    },
    [deps, refresh],
  );

  const handleSelect = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setMutationError(undefined);
    // Keep the URL shareable / reloadable on the selected batch (#58).
    const url = new URL(location.href);
    url.searchParams.set("task", taskId);
    history.replaceState(null, "", url);
  }, []);

  // Tasks arrive newest-first (the status router sorts by createdAt).
  const selected = tasks?.find((task) => task.id === selectedTaskId);
  const shown =
    selected ?? (selectedTaskId === undefined ? tasks?.[0] : undefined);

  return (
    <main className="manager">
      <h1>Transcriptly batch</h1>

      {tasks === undefined && <p className="muted">Loading batches…</p>}

      {tasks !== undefined && tasks.length === 0 && (
        <p className="muted">
          No batches yet. Select videos on a playlist or channel Videos page to
          start one.
        </p>
      )}

      {tasks !== undefined &&
        tasks.length > 0 &&
        selectedTaskId !== undefined &&
        !selected && (
          <p className="error-banner" role="alert">
            That batch task no longer exists.
          </p>
        )}

      {shown && (
        <BatchTaskDetail
          task={shown}
          mutationError={mutationError}
          onMutate={(message) => void handleMutate(message)}
        />
      )}

      {tasks !== undefined && tasks.length > 0 && (
        <section className="history">
          <h2>Recent batches</h2>
          <ul>
            {tasks.map((task) => {
              const failed = failedItemCount(task);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    className={`batch-row${task.id === shown?.id ? " is-selected" : ""}`}
                    onClick={() => handleSelect(task.id)}
                  >
                    <span className={`state state-${task.state}`}>
                      {STATE_LABELS[task.state]}
                    </span>
                    <span className="batch-date">
                      {formatTimestamp(task.createdAt)}
                    </span>
                    <span className="batch-count">
                      {`${doneItemCount(task)}/${task.items.length} done`}
                      {failed > 0 ? ` · ${failed} failed` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
