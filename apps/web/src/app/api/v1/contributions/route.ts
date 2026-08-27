import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { getAuthEnv } from "@/env/server";
import { isAllowedOrigin, parseOrigins } from "@/lib/api/origin-allowlist";
import { auth } from "@/lib/auth/auth";
import { errorResponse } from "@/lib/captures/response";
import { readJsonBody } from "@/lib/captures/validation";
import {
  PublicConfirmationRequiredError,
  storePublicContribution,
} from "@/lib/contributions/store";
import { validatePublicContributionPayload } from "@/lib/contributions/validation";

export const dynamic = "force-dynamic";

function allowedOrigins(): string[] {
  const env = getAuthEnv();
  return [env.BETTER_AUTH_URL, ...parseOrigins(env.EXTENSION_ORIGINS)];
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!isAllowedOrigin(request.headers.get("origin"), allowedOrigins())) {
    return errorResponse(403, {
      code: "origin_not_allowed",
      message: "The request origin is not allowed.",
      retryable: false,
      requestId,
    });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return errorResponse(401, {
      code: "unauthenticated",
      message: "Sign in before contributing to the public archive.",
      retryable: false,
      requestId,
    });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return errorResponse(body.code === "payload_too_large" ? 413 : 400, {
      code: body.code,
      message: body.message,
      retryable: false,
      requestId,
    });
  }
  const validated = validatePublicContributionPayload(body.payload);
  if (!validated.ok) {
    return errorResponse(
      validated.code === "invalid_timeline" ||
        validated.code === "target_video_mismatch"
        ? 422
        : 400,
      {
        code: validated.code,
        message: validated.message,
        retryable: false,
        requestId,
      },
    );
  }

  try {
    const result = await storePublicContribution(
      getDatabase(),
      session.user.id,
      validated.capture,
      validated.capturedAt,
      validated.confirmPublicProfile,
    );
    return Response.json(
      {
        success: true,
        data: {
          contributionId: result.contributionId,
          publicationId: result.publicationId,
          videoId: result.videoId,
          outcome: result.outcome,
          processedAt: new Date().toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof PublicConfirmationRequiredError) {
      return errorResponse(409, {
        code: error.code,
        message: error.message,
        retryable: false,
        requestId,
      });
    }
    console.error(
      JSON.stringify({
        event: "public_contribution_failed",
        requestId,
        userId: session.user.id,
        videoId: validated.targetVideoId,
      }),
    );
    return errorResponse(500, {
      code: "public_contribution_failed",
      message: "The transcript could not be contributed.",
      retryable: true,
      requestId,
    });
  }
}
