import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { getAuthEnv } from "@/env/server";
import { isAllowedOrigin, parseOrigins } from "@/lib/api/origin-allowlist";
import { auth } from "@/lib/auth/auth";
import { errorResponse, successResponse } from "@/lib/captures/response";
import {
  CaptureTimestampConflictError,
  storeCapture,
  TranscriptHashCollisionError,
} from "@/lib/captures/store";
import {
  contentTypeIsJson,
  readJsonBody,
  validateCapturePayload,
} from "@/lib/captures/validation";

export const dynamic = "force-dynamic";

function allowedCaptureOrigins(): string[] {
  const env = getAuthEnv();
  return [env.BETTER_AUTH_URL, ...parseOrigins(env.EXTENSION_ORIGINS)];
}

function logCaptureError(
  requestId: string,
  code: string,
  userId?: string,
  videoId?: string,
): void {
  // Deliberately limited fields: never include Capture content, description,
  // session cookies or provider credentials in structured logs.
  console.error(
    JSON.stringify({
      event: "capture_upload_failed",
      requestId,
      code,
      ...(userId ? { userId } : {}),
      ...(videoId ? { videoId } : {}),
    }),
  );
}

export async function POST(request: Request): Promise<Response> {
  const id = crypto.randomUUID();
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, allowedCaptureOrigins())) {
    return errorResponse(403, {
      code: "origin_not_allowed",
      message: "The request origin is not allowed.",
      retryable: false,
      requestId: id,
    });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return errorResponse(401, {
      code: "unauthenticated",
      message: "A valid website session is required.",
      retryable: false,
      requestId: id,
    });
  }

  if (!contentTypeIsJson(request.headers.get("content-type"))) {
    return errorResponse(415, {
      code: "unsupported_media_type",
      message: "Content-Type must be application/json.",
      retryable: false,
      requestId: id,
    });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    const status = body.code === "payload_too_large" ? 413 : 400;
    logCaptureError(id, body.code, session.user.id);
    return errorResponse(status, {
      code: body.code,
      message: body.message,
      retryable: false,
      requestId: id,
    });
  }

  const validated = validateCapturePayload(body.payload);
  if (!validated.ok) {
    logCaptureError(id, validated.code, session.user.id);
    return errorResponse(400, {
      code: validated.code,
      message: validated.message,
      retryable: false,
      requestId: id,
    });
  }

  try {
    const processedAt = new Date();
    const stored = await storeCapture(
      getDatabase(),
      session.user.id,
      validated.capture,
      validated.capturedAt,
      processedAt,
    );
    return successResponse({
      libraryItemId: stored.libraryItemId,
      videoId: stored.videoId,
      outcome: stored.outcome,
      ...(stored.reason ? { reason: stored.reason } : {}),
      currentCapturedAt: stored.currentCapturedAt.toISOString(),
      processedAt: processedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof CaptureTimestampConflictError) {
      logCaptureError(
        id,
        error.code,
        session.user.id,
        validated.capture.source.videoId,
      );
      return errorResponse(409, {
        code: error.code,
        message: error.message,
        retryable: false,
        requestId: id,
      });
    }
    if (error instanceof TranscriptHashCollisionError) {
      logCaptureError(
        id,
        error.code,
        session.user.id,
        validated.capture.source.videoId,
      );
      return errorResponse(500, {
        code: error.code,
        message: error.message,
        retryable: false,
        requestId: id,
      });
    }

    logCaptureError(
      id,
      "capture_store_failed",
      session.user.id,
      validated.capture.source.videoId,
    );
    return errorResponse(500, {
      code: "capture_store_failed",
      message: "The capture could not be stored.",
      retryable: true,
      requestId: id,
    });
  }
}
