import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { getAuthEnv } from "@/env/server";
import { isAllowedOrigin, parseOrigins } from "@/lib/api/origin-allowlist";
import { auth } from "@/lib/auth/auth";
import { errorResponse } from "@/lib/captures/response";
import {
  ContributionNotFoundError,
  withdrawContribution,
} from "@/lib/contributions/store";

export const dynamic = "force-dynamic";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * A mutation: the Origin allowlist is the CSRF boundary and stays strict -
 * a missing or disallowed Origin is rejected outright (#74, #64). Only the
 * session's own user may withdraw their Contribution.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
): Promise<Response> {
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
      message: "Sign in before withdrawing a contribution.",
      retryable: false,
      requestId,
    });
  }

  const { videoId } = await params;
  if (!VIDEO_ID.test(videoId)) {
    return errorResponse(400, {
      code: "invalid_video_id",
      message: "The video id is not a valid YouTube video id.",
      retryable: false,
      requestId,
    });
  }

  try {
    const result = await withdrawContribution(
      getDatabase(),
      session.user.id,
      videoId,
    );
    return Response.json(
      {
        success: true,
        data: {
          videoId: result.videoId,
          outcome: result.outcome,
          remainingContributors: result.remainingContributors,
          processedAt: new Date().toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ContributionNotFoundError) {
      return errorResponse(404, {
        code: error.code,
        message: error.message,
        retryable: false,
        requestId,
      });
    }
    console.error(
      JSON.stringify({
        event: "contribution_withdrawal_failed",
        requestId,
        userId: session.user.id,
        videoId,
      }),
    );
    return errorResponse(500, {
      code: "contribution_withdrawal_failed",
      message: "The contribution could not be withdrawn.",
      retryable: true,
      requestId,
    });
  }
}

function allowedOrigins(): string[] {
  const env = getAuthEnv();
  return [env.BETTER_AUTH_URL, ...parseOrigins(env.EXTENSION_ORIGINS)];
}
