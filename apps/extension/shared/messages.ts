import type { CaptureResult } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";

export const CAPTURE_REQUEST = "transcriptly:capture-request" as const;

export interface CaptureRequestMessage {
  type: typeof CAPTURE_REQUEST;
}

export type CaptureResponseMessage = CaptureResult;

/**
 * Cloud session status as reported by the background service worker.
 * Messages never carry session tokens or provider tokens - only this
 * coarse status plus the display email.
 */
export const CLOUD_SESSION_REQUEST =
  "transcriptly:cloud-session-request" as const;

export interface CloudSessionRequestMessage {
  type: typeof CLOUD_SESSION_REQUEST;
}

export type CloudSessionStatus =
  | { status: "signed-in"; email: string }
  | { status: "signed-out" }
  | { status: "unavailable" };

export const CLOUD_SIGN_OUT_REQUEST =
  "transcriptly:cloud-sign-out-request" as const;

export interface CloudSignOutRequestMessage {
  type: typeof CLOUD_SIGN_OUT_REQUEST;
}

export type CloudSignOutStatus = { status: "signed-out" } | { status: "error" };

/** Ask the background worker to persist a Capture for cloud upload (#35). */
export const CLOUD_SAVE_ENQUEUE = "transcriptly:cloud-save-enqueue" as const;

export interface CloudSaveEnqueueMessage {
  type: typeof CLOUD_SAVE_ENQUEUE;
  capture: Capture;
}

export type CloudSaveEnqueueStatus =
  | { ok: true; jobId: string }
  | { ok: false; message: string };

/** Ask the background worker for the current cloud queue status (#35). */
export const CLOUD_QUEUE_STATUS_REQUEST =
  "transcriptly:cloud-queue-status-request" as const;

export interface CloudQueueStatusRequestMessage {
  type: typeof CLOUD_QUEUE_STATUS_REQUEST;
  videoId?: string;
}

/** Ask the background worker to re-queue a failed cloud Job (#36). */
export const CLOUD_JOB_RETRY = "transcriptly:cloud-job-retry" as const;

export interface CloudJobRetryMessage {
  type: typeof CLOUD_JOB_RETRY;
  jobId: string;
}

export type CloudJobRetryStatus = { ok: true } | { ok: false; message: string };
