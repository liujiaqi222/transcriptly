import type { CaptureResult } from "@transcriptly/capture";

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
