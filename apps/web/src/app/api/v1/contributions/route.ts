import { getDatabase } from "@/db/client";
import { requireMutationSession } from "@/lib/api/mutation-guard";
import { errorResponse } from "@/lib/captures/response";
import { readJsonBody } from "@/lib/captures/validation";
import {
  contributePublicly,
  PublicConfirmationRequiredError,
} from "@/lib/contributions/store";
import {
  isStructuralRejection,
  validatePublicContributionPayload,
} from "@/lib/contributions/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const guard = await requireMutationSession(
    request,
    requestId,
    "Sign in before contributing to the public archive.",
  );
  if (guard.denial) return guard.denial;
  const session = guard.session;

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
    return errorResponse(isStructuralRejection(validated.code) ? 422 : 400, {
      code: validated.code,
      message: validated.message,
      retryable: false,
      requestId,
    });
  }

  try {
    const result = await contributePublicly(
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
