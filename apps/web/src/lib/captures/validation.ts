import { type Capture, captureSchema } from "@transcriptly/schema";
import type { z } from "zod";

export const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;
export const MAX_CAPTURE_FUTURE_MS = 10 * 60 * 1000;

export type CaptureValidationErrorCode =
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_capture"
  | "captured_at_in_future";

export interface CaptureValidationError {
  ok: false;
  code: CaptureValidationErrorCode;
  message: string;
}

export interface ValidCapture {
  ok: true;
  capture: Capture;
  capturedAt: Date;
}

export type CaptureValidationResult = ValidCapture | CaptureValidationError;

export function contentTypeIsJson(contentType: string | null): boolean {
  if (!contentType) return false;
  return (
    contentType.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
  );
}

export function validateCapturePayload(
  payload: unknown,
  now = new Date(),
): CaptureValidationResult {
  const parsed = captureSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_capture",
      message: "The capture payload is invalid.",
    };
  }

  const capturedAt = new Date(parsed.data.capturedAt);
  if (capturedAt.getTime() > now.getTime() + MAX_CAPTURE_FUTURE_MS) {
    return {
      ok: false,
      code: "captured_at_in_future",
      message: "capturedAt is more than 10 minutes in the future.",
    };
  }

  return { ok: true, capture: parsed.data, capturedAt };
}

export async function readJsonBody(request: Request): Promise<
  | { ok: true; payload: unknown }
  | {
      ok: false;
      code: "unsupported_media_type" | "payload_too_large" | "invalid_capture";
      message: string;
    }
> {
  if (!contentTypeIsJson(request.headers.get("content-type"))) {
    return {
      ok: false,
      code: "unsupported_media_type",
      message: "Content-Type must be application/json.",
    };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isFinite(length) || length > MAX_CAPTURE_BYTES) {
      return {
        ok: false,
        code: "payload_too_large",
        message: "The capture payload exceeds the 10 MiB limit.",
      };
    }
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_CAPTURE_BYTES) {
    return {
      ok: false,
      code: "payload_too_large",
      message: "The capture payload exceeds the 10 MiB limit.",
    };
  }

  try {
    return { ok: true, payload: JSON.parse(new TextDecoder().decode(body)) };
  } catch {
    return {
      ok: false,
      code: "invalid_capture",
      message: "The request body must be valid JSON.",
    };
  }
}

export function zodIssues(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) => issue.path.join(".") || "body");
}
