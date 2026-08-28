import { headers } from "next/headers";
import { getAuthEnv } from "@/env/server";
import type { AuthSession } from "@/lib/auth/auth";
import { auth } from "@/lib/auth/auth";
import { errorResponse } from "@/lib/captures/response";
import { isAllowedOrigin, parseOrigins } from "./origin-allowlist";

function allowedOrigins(): string[] {
  const env = getAuthEnv();
  return [env.BETTER_AUTH_URL, ...parseOrigins(env.EXTENSION_ORIGINS)];
}

export type MutationSession =
  | { session: AuthSession; denial?: undefined }
  | { session?: undefined; denial: Response };

/**
 * The shared guard for cookie-authenticated JSON mutations: the strict
 * Origin allowlist (a missing Origin is rejected - it is the CSRF boundary,
 * see docs/agents/extension-origin-boundary.md) followed by the session
 * check. Callers supply the action-specific unauthenticated message.
 */
export async function requireMutationSession(
  request: Request,
  requestId: string,
  unauthenticatedMessage: string,
): Promise<MutationSession> {
  if (!isAllowedOrigin(request.headers.get("origin"), allowedOrigins())) {
    return {
      denial: errorResponse(403, {
        code: "origin_not_allowed",
        message: "The request origin is not allowed.",
        retryable: false,
        requestId,
      }),
    };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return {
      denial: errorResponse(401, {
        code: "unauthenticated",
        message: unauthenticatedMessage,
        retryable: false,
        requestId,
      }),
    };
  }

  return { session };
}
