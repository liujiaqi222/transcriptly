import type { Capture } from "@transcriptly/schema";
import type { CloudClient } from "@/cloud/client";
import type {
  CloudFailure,
  CloudJobRecord,
  CloudJobStore,
  CloudQueueStatus,
} from "@/cloud/jobs";

/**
 * Single-concurrency FIFO cloud upload queue (#35, #36).
 *
 * The queue owns exactly one automatic attempt per Job: after a failure it
 * never replays on its own - no alarms, no backoff. Pending Jobs do continue
 * when the service worker wakes; only Failed Jobs wait for an explicit
 * user Retry.
 */

/** Successful upload parsed from the #28 response contract. */
interface UploadSuccess {
  contributionId: string;
  outcome: "published" | "contributed" | "unchanged";
}

class UploadResponseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface SuccessBody {
  success: true;
  data: {
    contributionId?: unknown;
    videoId?: unknown;
    outcome?: unknown;
  };
}

interface ErrorBody {
  success: false;
  error?: { code?: unknown; message?: unknown };
}

/**
 * Parse the raw upload Response into a success or a typed HTTP error.
 * A response that cannot be parsed (dropped connection, non-JSON body)
 * throws like a network error and is classified retryable.
 */
async function parseUploadResponse(response: Response): Promise<UploadSuccess> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new UploadResponseError(
      response.status,
      "invalid_response",
      "The cloud returned a response that could not be read.",
    );
  }

  if (response.ok) {
    const parsed = body as SuccessBody;
    const outcome = parsed?.data?.outcome;
    const contributionId = parsed?.data?.contributionId;
    if (
      parsed?.success === true &&
      (outcome === "published" ||
        outcome === "contributed" ||
        outcome === "unchanged") &&
      typeof contributionId === "string"
    ) {
      return { contributionId, outcome };
    }
    throw new UploadResponseError(
      response.status,
      "invalid_response",
      "The cloud returned an unexpected success response.",
    );
  }

  const parsed = body as ErrorBody;
  const code =
    parsed?.success === false && typeof parsed.error?.code === "string"
      ? parsed.error.code
      : "http_error";
  const message =
    parsed?.success === false && typeof parsed.error?.message === "string"
      ? parsed.error.message
      : `The cloud rejected the upload (HTTP ${response.status}).`;
  throw new UploadResponseError(response.status, code, message);
}

/**
 * Classify a failure per #36: network and 429/5xx are retryable, 401/403 ask
 * for a fresh sign-in (there is no token to refresh, #32), and everything
 * else - validation, conflict, size, media type - is permanent.
 */
export function classifyUploadFailure(error: unknown): CloudFailure {
  if (error instanceof UploadResponseError) {
    if (error.status === 401 || error.status === 403) {
      return {
        kind: "auth",
        code: error.code,
        message:
          "Sign in to Transcriptly again, then retry the public contribution.",
        httpStatus: error.status,
      };
    }
    if (
      error.status === 429 ||
      error.status >= 500 ||
      // A response that could not be parsed (dropped mid-body) is treated
      // like a network failure, not a rejection by the server.
      error.code === "invalid_response"
    ) {
      return {
        kind: "retryable",
        code: error.code,
        message: `${error.message} Retry in a moment.`,
        httpStatus: error.status,
      };
    }
    return {
      kind: "permanent",
      code: error.code,
      message: error.message,
      httpStatus: error.status,
    };
  }

  return {
    kind: "network",
    code: "network_error",
    message: "Could not reach the Transcriptly cloud. Retry in a moment.",
  };
}

export interface CloudUploadQueue {
  /** Persist a Capture and start draining the queue. */
  enqueue(
    capture: Capture,
    options?: { confirmPublicProfile?: boolean },
  ): Promise<CloudJobRecord>;
  /** Re-queue a failed Job and start draining the queue. */
  retry(jobId: string): Promise<CloudJobRecord | undefined>;
  getStatus(videoId?: string): Promise<CloudQueueStatus>;
  /** Startup recovery plus a drain. */
  recoverAndDrain(): Promise<void>;
  /** Sign-out: drop all Jobs and receipts. */
  clearAll(): Promise<void>;
}

export interface CloudUploadQueueOptions {
  store: CloudJobStore;
  client: Pick<CloudClient, "uploadCapture">;
  /** Test seam for receipt timestamps. */
  now?: () => number;
}

export function createCloudUploadQueue(
  options: CloudUploadQueueOptions,
): CloudUploadQueue {
  const { store, client } = options;
  const now = options.now ?? (() => Date.now());
  let draining = false;
  // The Job currently being uploaded by this worker, if any. Recovery
  // must skip it: a periodic alarm firing mid-upload would otherwise read
  // `uploading` from IndexedDB and mistake the live upload for a dead
  // worker's leftover (#36).
  let activeJobId: string | undefined;

  async function runJob(job: CloudJobRecord): Promise<void> {
    if (!job.capture) return;
    activeJobId = job.id;
    try {
      const response = job.confirmPublicProfile
        ? await client.uploadCapture(job.capture, {
            confirmPublicProfile: true,
          })
        : await client.uploadCapture(job.capture);
      const success = await parseUploadResponse(response);
      await store.completeSaved(job.id, {
        videoId: job.videoId,
        contributionId: success.contributionId,
        outcome: success.outcome,
        contributedAt: new Date(now()).toISOString(),
      });
    } catch (error) {
      await store.completeFailed(job.id, classifyUploadFailure(error));
    } finally {
      activeJobId = undefined;
    }
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      for (;;) {
        const job = await store.claimNextPending();
        if (!job?.capture) break;
        await runJob(job);
      }
    } finally {
      draining = false;
    }
  }

  return {
    async enqueue(capture, enqueueOptions) {
      const record = await store.enqueue(capture, enqueueOptions);
      void drain();
      return record;
    },

    async retry(jobId) {
      const record = await store.retry(jobId);
      if (record) void drain();
      return record;
    },

    getStatus(videoId) {
      return store.getStatus(videoId);
    },

    async recoverAndDrain() {
      // Skip the live upload (if any) so recovery only targets Jobs left
      // behind by a genuinely dead worker (#36), never the in-flight one.
      await store.recover(
        activeJobId ? { skipJobIds: [activeJobId] } : undefined,
      );
      await drain();
    },

    async clearAll() {
      await store.clearAll();
    },
  };
}
