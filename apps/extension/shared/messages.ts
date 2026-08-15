import type { CaptureResult } from "@transcriptly/capture";

export const CAPTURE_REQUEST = "transcriptly:capture-request" as const;

export interface CaptureRequestMessage {
  type: typeof CAPTURE_REQUEST;
}

export type CaptureResponseMessage = CaptureResult;
