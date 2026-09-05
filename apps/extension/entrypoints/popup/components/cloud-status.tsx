import { ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { webOrigin } from "@/cloud/client";
import type { CloudJobSummary, CloudQueueStatus } from "@/cloud/jobs";

interface CloudStatusPanelProps {
  queueStatus?: CloudQueueStatus;
  signedIn: boolean;
  onRetry(jobId: string): void;
  /** Delete a failed Job outright (#108). */
  onDismiss(jobId: string): void;
}

/**
 * Popup-side public contribution failure history (#35, #36, #64): an
 * expandable badge listing every failed Job with an explicit Retry and,
 * since #108, an explicit Dismiss - giving up on the upload deletes the
 * record instead of waiting out the 7-day retention. The current video's
 * save feedback lives in the footer's CloudSaveStatus, which stays visible
 * while the transcript preview scrolls.
 */
export function CloudStatusPanel({
  queueStatus,
  signedIn,
  onRetry,
  onDismiss,
}: CloudStatusPanelProps) {
  const [failedOpen, setFailedOpen] = useState(false);
  const failed = (queueStatus?.failed ?? []).filter(
    (job) => job.id !== queueStatus?.current?.id,
  );

  if (failed.length === 0) return null;

  return (
    <section className="cloud-status" aria-label="Public contribution status">
      <div className="cloud-failed">
        <button
          type="button"
          className="cloud-badge"
          aria-expanded={failedOpen}
          onClick={() => setFailedOpen((open) => !open)}
        >
          {failed.length} public contribution
          {failed.length > 1 ? "s" : ""} failed
        </button>
        {failedOpen && (
          <ul className="cloud-failed-list">
            {failed.map((job) => (
              <li key={job.id}>
                <span className="cloud-failed-title" title={job.title}>
                  {job.title}
                </span>
                <RetryButton job={job} signedIn={signedIn} onRetry={onRetry} />
                <DismissButton job={job} onDismiss={onDismiss} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface CloudSaveStatusProps {
  queueStatus?: CloudQueueStatus;
  /** Popup-local enqueue/retry errors that never became a Job. */
  cloudError?: string;
  signedIn: boolean;
  onRetry(jobId: string): void;
}

/** The current video's public-contribution feedback, rendered inside the
 *  footer next to the Save button (#64): enqueue/retry errors plus the
 *  Contributing… / Contributed / Failed progress of this video's Job. */
export function CloudSaveStatus({
  queueStatus,
  cloudError,
  signedIn,
  onRetry,
}: CloudSaveStatusProps) {
  const current = queueStatus?.current;

  return (
    <>
      {cloudError && (
        <p className="error-banner" role="alert">
          {cloudError}
        </p>
      )}
      {(current?.state === "pending" || current?.state === "uploading") && (
        <p className="cloud-saving" role="status">
          Contributing…
        </p>
      )}
      {current?.state === "saved" && current.receipt && (
        <div className="cloud-saved" role="status">
          <span>Contributed ({current.receipt.outcome})</span>
          <a
            href={`${webOrigin}/transcripts/${current.receipt.videoId}`}
            target="_blank"
            rel="noreferrer"
          >
            View transcript
            <ExternalLink />
          </a>
        </div>
      )}
      {current?.state === "failed" && current.failure && (
        <div className="cloud-failed-current" role="alert">
          <p>Public contribution failed: {current.failure.message}</p>
          <RetryButton job={current} signedIn={signedIn} onRetry={onRetry} />
        </div>
      )}
    </>
  );
}

function RetryButton({
  job,
  signedIn,
  onRetry,
}: {
  job: CloudJobSummary;
  signedIn: boolean;
  onRetry(jobId: string): void;
}) {
  const failure = job.failure;
  if (!failure || failure.kind === "permanent") return null;

  // Auth failures need a fresh sign-in before a retry can succeed (#36).
  const blockedBySignIn = failure.kind === "auth" && !signedIn;
  return (
    <span className="cloud-retry">
      <button
        type="button"
        onClick={() => onRetry(job.id)}
        disabled={blockedBySignIn}
      >
        Retry
      </button>
      {blockedBySignIn && (
        <span className="cloud-retry-hint">Sign in first</span>
      )}
    </span>
  );
}

/** The per-row give-up control (#108): deletes the failed record instead
 *  of waiting out the 7-day retention. */
function DismissButton({
  job,
  onDismiss,
}: {
  job: CloudJobSummary;
  onDismiss(jobId: string): void;
}) {
  return (
    <button
      type="button"
      className="icon-button cloud-dismiss"
      aria-label={`Dismiss failed contribution: ${job.title}`}
      title="Dismiss"
      onClick={() => onDismiss(job.id)}
    >
      <X />
    </button>
  );
}
