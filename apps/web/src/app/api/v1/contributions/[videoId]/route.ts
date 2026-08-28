import { getDatabase } from "@/db/client";
import { requireMutationSession } from "@/lib/api/mutation-guard";
import { errorResponse } from "@/lib/captures/response";
import {
  ContributionNotFoundError,
  withdrawContribution,
} from "@/lib/contributions/store";
import { YOUTUBE_VIDEO_ID_PATTERN } from "@/lib/contributions/validation";

export const dynamic = "force-dynamic";

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
  const guard = await requireMutationSession(
    request,
    requestId,
    "Sign in before withdrawing a contribution.",
  );
  if (guard.denial) return guard.denial;
  const session = guard.session;

  const { videoId } = await params;
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
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
