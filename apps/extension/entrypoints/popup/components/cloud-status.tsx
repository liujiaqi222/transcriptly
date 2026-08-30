import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { webOrigin } from "@/cloud/client";
import type { CloudJobSummary, CloudQueueStatus } from "@/cloud/jobs";

interface CloudStatusPanelProps {
  queueStatus?: CloudQueueStatus;
  /** Popup-local enqueue/retry errors that never became a Job. */
  cloudError?: string;
  signedIn: boolean;
  onRetry(jobId: string): void;
}

/**
 * Popup-side public contribution status (#35, #36, #64): the current video's
 * Failed state plus an expandable badge listing every failed Job with an
 * explicit Retry. Internal queue details stay hidden.
 */
export function CloudStatusPanel({
  queueStatus,
  cloudError,
  signedIn,
  onRetry,
}: CloudStatusPanelProps) {
  const [failedOpen, setFailedOpen] = useState(false);
  const failed = queueStatus?.failed ?? [];
  const current = queueStatus?.current;

  return (
    <section className="cloud-status" aria-label="Public contribution status">
      {cloudError && (
        <p className="error-banner" role="alert">
          {cloudError}
        </p>
      )}

      {failed.length > 0 && (
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
                  <RetryButton
                    job={job}
                    signedIn={signedIn}
                    onRetry={onRetry}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {current?.state === "pending" && (
        <p className="cloud-saving" role="status">
          Contributing…
        </p>
      )}
      {current?.state === "uploading" && (
        <p className="cloud-saving" role="status">
          Contributing…
        </p>
      )}
      {current?.state === "saved" && current.receipt && (
        <div className="cloud-saved" role="status">
          <span>Contributed ({current.receipt.outcome})</span>
          <a
            href={`${webOrigin}/videos/${current.receipt.videoId}`}
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
    </section>
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
