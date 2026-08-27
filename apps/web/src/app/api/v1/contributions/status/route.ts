import { headers } from "next/headers";
import { getDatabase } from "@/db/client";
import { getAuthEnv } from "@/env/server";
import { isAllowedOrigin, parseOrigins } from "@/lib/api/origin-allowlist";
import { auth } from "@/lib/auth/auth";
import { errorResponse } from "@/lib/captures/response";
import { getPublicConsent } from "@/lib/contributions/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  // Read-only + cookie-authenticated, so the origin allowlist only gates
  // callers that actually present an Origin. The extension's background
  // worker fetches with host permissions, which bypass CORS and strip the
  // Origin header from GET requests (#64); SameSite=Lax already keeps
  // cross-site web pages from attaching their session cookie here.
  const origin = request.headers.get("origin");
  if (origin) {
    const env = getAuthEnv();
    if (
      !isAllowedOrigin(origin, [
        env.BETTER_AUTH_URL,
        ...parseOrigins(env.EXTENSION_ORIGINS),
      ])
    ) {
      return errorResponse(403, {
        code: "origin_not_allowed",
        message: "The request origin is not allowed.",
        retryable: false,
      });
    }
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return errorResponse(401, {
      code: "unauthenticated",
      message: "Sign in before contributing to the public archive.",
      retryable: false,
    });
  }
  const consent = await getPublicConsent(getDatabase(), session.user.id);
  return Response.json(
    {
      success: true,
      data: {
        confirmed: consent !== null,
        displayName: session.user.name,
        avatarUrl: session.user.image ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
