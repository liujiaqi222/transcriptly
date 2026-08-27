import { type Capture, captureSchema } from "@transcriptly/schema";
import { z } from "zod";
import {
  type CaptureValidationError,
  MAX_CAPTURE_FUTURE_MS,
} from "../captures/validation";

const videoIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{11}$/, "must be an 11-character YouTube video id");

const contributionPayloadSchema = z.strictObject({
  capture: captureSchema,
  targetVideoId: videoIdSchema,
  confirmPublicProfile: z.literal(true).optional(),
});

export type PublicContributionValidationErrorCode =
  | CaptureValidationError["code"]
  | "target_video_mismatch"
  | "empty_transcript"
  | "invalid_timeline"
  | "duplicate_transcript";

export type ValidPublicContribution = {
  ok: true;
  capture: Capture;
  capturedAt: Date;
  targetVideoId: string;
  confirmPublicProfile: boolean;
};

export type PublicContributionValidationResult =
  | ValidPublicContribution
  | {
      ok: false;
      code: PublicContributionValidationErrorCode;
      message: string;
    };

function isMonotonic(values: readonly { start: number }[]): boolean {
  return values.every(
    (value, index) =>
      index === 0 || value.start >= (values[index - 1]?.start ?? 0),
  );
}

/**
 * A provable whole-transcript duplication (#73): the segment sequence is
 * itself repeated exactly end to end (the first half equals the second
 * half). This is a capture-side artifact, not a semantic quality judgment.
 */
function isWholeTranscriptDuplication(
  segments: readonly { start: number; text: string }[],
): boolean {
  const length = segments.length;
  if (length < 2 || length % 2 !== 0) return false;
  const half = length / 2;
  return segments.every(
    (segment, index) =>
      index >= half ||
      (segment.start === segments[index + half]?.start &&
        segment.text === segments[index + half]?.text),
  );
}

function reportsEmptySegments(error: z.ZodError): boolean {
  return error.issues.some(
    (issue) =>
      issue.code === "too_small" && issue.path.join(".") === "capture.segments",
  );
}

export function validatePublicContributionPayload(
  payload: unknown,
  now = new Date(),
): PublicContributionValidationResult {
  const parsed = contributionPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    if (reportsEmptySegments(parsed.error)) {
      return {
        ok: false,
        code: "empty_transcript",
        message: "The transcript has no segments.",
      };
    }
    return {
      ok: false,
      code: "invalid_capture",
      message: "The public contribution payload is invalid.",
    };
  }

  const { capture, targetVideoId } = parsed.data;
  if (capture.source.videoId !== targetVideoId) {
    return {
      ok: false,
      code: "target_video_mismatch",
      message: "The captured video does not match the requested video.",
    };
  }

  const capturedAt = new Date(capture.capturedAt);
  if (capturedAt.getTime() > now.getTime() + MAX_CAPTURE_FUTURE_MS) {
    return {
      ok: false,
      code: "captured_at_in_future",
      message: "capturedAt is more than 10 minutes in the future.",
    };
  }

  // Duplication is checked before the timeline: a duplicated sequence with
  // restarted start times also fails monotonicity, and the duplication code
  // is the more specific, actionable diagnosis of a capture-side bug.
  if (isWholeTranscriptDuplication(capture.segments)) {
    return {
      ok: false,
      code: "duplicate_transcript",
      message:
        "The transcript is a whole-transcript duplication; capture the video again.",
    };
  }

  const duration = capture.source.durationSeconds;
  const outsideDuration =
    duration !== undefined &&
    [...capture.segments, ...(capture.chapters ?? [])].some(
      (entry) => entry.start > duration,
    );
  if (
    !isMonotonic(capture.segments) ||
    !isMonotonic(capture.chapters ?? []) ||
    outsideDuration
  ) {
    return {
      ok: false,
      code: "invalid_timeline",
      message:
        "The transcript timeline must be ordered and stay within the video duration.",
    };
  }

  return {
    ok: true,
    capture,
    capturedAt,
    targetVideoId,
    confirmPublicProfile: parsed.data.confirmPublicProfile === true,
  };
}
