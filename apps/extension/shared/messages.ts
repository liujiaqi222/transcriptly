import type { CaptureResult } from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";

export const CAPTURE_REQUEST = "transcriptly:capture-request" as const;

export interface CaptureRequestMessage {
  type: typeof CAPTURE_REQUEST;
  /** How long the capture may poll the page for a transcript. */
  timeoutMs?: number;
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

/** Probe whether a tab's content script is loaded and ready to capture. */
export const CONTENT_PING = "transcriptly:content-ping" as const;

export interface ContentPingMessage {
  type: typeof CONTENT_PING;
}

export interface ContentPingResponse {
  ok: true;
}

/** Create a task from videos selected on a playlist/channel page (#26). */
export const BATCH_START = "transcriptly:batch-start" as const;

export interface BatchStartMessage {
  type: typeof BATCH_START;
  videos: import("@/batch/jobs").BatchVideo[];
  destinations: import("@/batch/jobs").BatchDestination[];
}

export type BatchStartStatus =
  | { ok: true; taskId: string }
  | { ok: false; message: string };

/** Ask the background worker for batch task state (#26). */
export const BATCH_STATUS_REQUEST =
  "transcriptly:batch-status-request" as const;

export interface BatchStatusRequestMessage {
  type: typeof BATCH_STATUS_REQUEST;
  taskId?: string;
}

export interface BatchStatusResult {
  tasks: import("@/batch/jobs").BatchTask[];
}

export type BatchMutationStatus = { ok: true } | { ok: false; message: string };

/** Ask the background worker to open a private extension manager page. */
export const BATCH_OPEN_MANAGER = "transcriptly:batch-open-manager" as const;

export interface BatchOpenManagerMessage {
  type: typeof BATCH_OPEN_MANAGER;
  taskId: string;
}

/** Pause a running batch after the current video finishes (#26). */
export const BATCH_PAUSE = "transcriptly:batch-pause" as const;

export interface BatchPauseMessage {
  type: typeof BATCH_PAUSE;
  taskId: string;
}

/** Cancel every video that has not started yet (#26). */
export const BATCH_STOP = "transcriptly:batch-stop" as const;

export interface BatchStopMessage {
  type: typeof BATCH_STOP;
  taskId: string;
}

/** Continue a paused batch (#26). */
export const BATCH_RESUME = "transcriptly:batch-resume" as const;

export interface BatchResumeMessage {
  type: typeof BATCH_RESUME;
  taskId: string;
}

/** Re-queue one video's failed/skipped save for another attempt (#26). */
export const BATCH_RETRY_ITEM = "transcriptly:batch-retry-item" as const;

export interface BatchRetryItemMessage {
  type: typeof BATCH_RETRY_ITEM;
  taskId: string;
  videoId: string;
  destinations?: import("@/batch/jobs").BatchDestination[];
}

/** Which of the given videos Transcriptly already knows as saved (#26). */
export const BATCH_LOOKUP_REQUEST =
  "transcriptly:batch-lookup-request" as const;
export interface BatchLookupRequestMessage {
  type: typeof BATCH_LOOKUP_REQUEST;
  videoIds: string[];
}

export interface BatchLookupVideo {
  videoId: string;
  localSaved: boolean;
  cloudSaved: boolean;
}

export interface BatchLookupResult {
  videos: BatchLookupVideo[];
}

/**
 * Popup -> content script (tab-targeted, #56): enter on-demand selection
 * mode on a batch source page. Not routed through the background worker.
 */
export const BATCH_ENTER_SELECTION_REQUEST =
  "transcriptly:batch-enter-selection-request" as const;

export interface BatchEnterSelectionRequestMessage {
  type: typeof BATCH_ENTER_SELECTION_REQUEST;
}

export type BatchEnterSelectionStatus =
  | { ok: true }
  | { ok: false; message: string };

export type BatchMessage =
  | BatchStartMessage
  | BatchStatusRequestMessage
  | BatchOpenManagerMessage
  | BatchPauseMessage
  | BatchStopMessage
  | BatchResumeMessage
  | BatchRetryItemMessage
  | BatchLookupRequestMessage;

export type BatchMessageResult =
  | BatchStartStatus
  | BatchStatusResult
  | BatchMutationStatus
  | BatchLookupResult;

/**
 * Manager Local Save Host protocol (#59): the service worker cannot
 * show Chrome's folder-permission prompt, so local batch writes are
 * delegated to the manager page (one workbench for progress, folder
 * authorization and writes). Responses are typed results - permission
 * problems are signaled as `permission-required`, never string-matched,
 * and permission waits are NOT part of any timeout: the worker pauses
 * the batch and the page asks the user.
 * All messages are tab-targeted at the manager page.
 */
export const MANAGER_LOCAL_PING = "transcriptly:manager-local-ping" as const;

export interface ManagerLocalPingMessage {
  type: typeof MANAGER_LOCAL_PING;
}

export interface ManagerLocalPingResponse {
  ok: true;
}

export const MANAGER_LOCAL_PREFLIGHT =
  "transcriptly:manager-local-preflight" as const;

export interface ManagerLocalPreflightMessage {
  type: typeof MANAGER_LOCAL_PREFLIGHT;
}

export type ManagerLocalPreflightResponse =
  | { ok: true; directoryName: string }
  | { ok: false; reason: "permission-required"; directoryName?: string }
  | { ok: false; reason: "no-directory" }
  | { ok: false; reason: "error"; message: string };

export const MANAGER_LOCAL_SAVE = "transcriptly:manager-local-save" as const;

export interface ManagerLocalSaveMessage {
  type: typeof MANAGER_LOCAL_SAVE;
  capture: import("@transcriptly/schema").Capture;
}

export type ManagerLocalSaveResponse =
  | {
      ok: true;
      directoryName: string;
      filename: string;
      receiptError?: string;
    }
  | { ok: false; reason: "permission-required"; directoryName?: string }
  | { ok: false; reason: "no-directory" }
  | { ok: false; reason: "error"; message: string };
