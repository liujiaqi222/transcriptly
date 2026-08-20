import { randomUUID } from "node:crypto";

export interface CaptureSuccessData {
  libraryItemId: string;
  videoId: string;
  outcome: "created" | "updated" | "unchanged";
  reason?: "duplicate" | "stale";
  currentCapturedAt: string;
  processedAt: string;
}

export interface CaptureErrorData {
  code: string;
  message: string;
  requestId: string;
  retryable: boolean;
}

export function requestId(): string {
  return randomUUID();
}

export function successResponse(data: CaptureSuccessData): Response {
  return Response.json(
    { success: true, data },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export function errorResponse(
  status: number,
  data: Omit<CaptureErrorData, "requestId"> & { requestId?: string },
): Response {
  return Response.json(
    {
      success: false,
      error: {
        ...data,
        requestId: data.requestId ?? requestId(),
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
