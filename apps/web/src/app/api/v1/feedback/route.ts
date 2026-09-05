import { getDatabase } from "@/db/client";
import { extensionFeedback } from "@/db/schema";
import { errorResponse } from "@/lib/captures/response";
import { validateFeedbackPayload } from "@/lib/feedback/validation";
import { feedbackRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * First hop of X-Forwarded-For as the limiter key: the app sits behind a
 * reverse proxy in production, so the socket peer is not the client.
 */
function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}

/**
 * Anonymous, unauthenticated write, so unlike the cookie-authenticated
 * JSON APIs (#64) the Origin allowlist is not the CSRF boundary here:
 * `application/json` forces browsers into a CORS preflight and non-JSON
 * simple requests are rejected below, closing the cross-site form vector.
 * Scripted same-origin bots are absorbed by the honeypot instead (#104).
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/json") {
    return errorResponse(415, {
      code: "unsupported_media_type",
      message: "Content-Type must be application/json.",
      retryable: false,
      requestId,
    });
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 32_000) {
      throw new Error("too_large");
    }
    payload = JSON.parse(body);
  } catch {
    return errorResponse(400, {
      code: "invalid_feedback",
      message: "The feedback payload is invalid.",
      retryable: false,
      requestId,
    });
  }

  const feedback = validateFeedbackPayload(payload);
  if (!feedback) {
    return errorResponse(422, {
      code: "invalid_feedback",
      message: "Please provide a rating and valid feedback fields.",
      retryable: false,
      requestId,
    });
  }

  // Honeypot: accept the request to avoid teaching bots about the filter.
  if (feedback.website) return Response.json({ success: true });

  // Rate limit after the honeypot so scripted bots keep receiving fake
  // success and never learn this filter exists (#104).
  if (!feedbackRateLimiter.tryConsume(clientIp(request))) {
    return errorResponse(429, {
      code: "rate_limited",
      message: "Too much feedback from this client. Please try again later.",
      retryable: true,
      requestId,
    });
  }

  try {
    await getDatabase()
      .insert(extensionFeedback)
      .values({
        source: feedback.source,
        rating: feedback.rating,
        reasons: feedback.reasons,
        details: feedback.details,
        contactEmail: feedback.contactEmail,
        extensionVersion: feedback.extensionVersion,
        userAgent: request.headers.get("user-agent"),
      });
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error(
      JSON.stringify({ event: "feedback_submission_failed", requestId, error }),
    );
    return errorResponse(500, {
      code: "feedback_submission_failed",
      message: "Feedback could not be saved.",
      retryable: true,
      requestId,
    });
  }
}
