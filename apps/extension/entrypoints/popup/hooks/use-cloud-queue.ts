import { useCallback, useEffect, useState } from "react";
import type { CloudQueueStatus } from "@/cloud/jobs";
import { errorMessage } from "@/entrypoints/popup/utils";
import type { PopupDependencies } from "../app";

/** Poll cadence for the cloud queue status while the popup is open. */
const QUEUE_STATUS_POLL_MS = 1500;

/** The popup's window into the background cloud queue (#35, #36): polls
 *  the current video's job so Saving / Saved / Failed survive popup close
 *  and reopen, and retries failed jobs. */
export function useCloudQueue(deps: PopupDependencies, activeVideoId?: string) {
  const [queueStatus, setQueueStatus] = useState<
    CloudQueueStatus | undefined
  >();
  const [cloudError, setCloudError] = useState<string | undefined>();
  const [queueStatusRefresh, setQueueStatusRefresh] = useState(0);

  const refreshQueueStatus = useCallback(() => {
    setQueueStatusRefresh((count) => count + 1);
  }, []);

  // Bumping queueStatusRefresh forces an immediate re-poll after
  // enqueue/retry.
  useEffect(() => {
    if (!activeVideoId) return;
    void queueStatusRefresh;
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await deps.cloud.getCloudQueueStatus(activeVideoId);
        if (!cancelled) setQueueStatus(next);
      } catch {
        // The background worker is unreachable; the next tick retries.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), QUEUE_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeVideoId, queueStatusRefresh, deps]);

  const handleRetry = useCallback(
    async (jobId: string) => {
      try {
        const result = await deps.cloud.retryCloudJob(jobId);
        if (result.ok) {
          setCloudError(undefined);
          refreshQueueStatus();
        } else {
          setCloudError(result.message);
        }
      } catch (error) {
        setCloudError(errorMessage(error));
      }
    },
    [deps, refreshQueueStatus],
  );

  /** Give up on a failed Job: delete its record (#108). A failed dismiss
   *  surfaces in the same banner - the Job may already be gone. */
  const handleDismiss = useCallback(
    async (jobId: string) => {
      try {
        const result = await deps.cloud.dismissCloudJob(jobId);
        if (result.ok) {
          refreshQueueStatus();
        } else {
          setCloudError(result.message);
        }
      } catch (error) {
        setCloudError(errorMessage(error));
      }
    },
    [deps, refreshQueueStatus],
  );

  return {
    queueStatus,
    cloudError,
    setCloudError,
    refreshQueueStatus,
    handleRetry,
    handleDismiss,
  };
}
