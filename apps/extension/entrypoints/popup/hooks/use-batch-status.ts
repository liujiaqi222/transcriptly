import { useEffect, useState } from "react";
import type { BatchTask } from "@/batch/jobs";
import type { PopupDependencies } from "../app";

/** Poll cadence for the active batch task while the popup is open (#58). */
const BATCH_STATUS_POLL_MS = 2000;

/** Newest running or paused batch, polled from the background worker so
 *  the manager-page entry stays reachable after the YouTube source page
 *  is closed (#58 AC). */
export function useBatchStatus(deps: PopupDependencies) {
  const [activeBatchTask, setActiveBatchTask] = useState<
    BatchTask | undefined
  >();

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await deps.getBatchStatus();
        if (cancelled) return;
        // Tasks arrive newest-first (the status router sorts them).
        setActiveBatchTask(
          result.tasks.find(
            (task) =>
              task.state === "queued" ||
              task.state === "running" ||
              task.state === "paused",
          ),
        );
      } catch {
        // The background worker is unreachable; the next tick retries.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), BATCH_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [deps]);

  return { activeBatchTask };
}
