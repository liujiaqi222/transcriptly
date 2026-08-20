import type { Capture } from "@transcriptly/schema";
import type {
  CloudSessionStatus,
  CloudSignOutStatus,
} from "@/shared/messages";

/**
 * The web origin this build talks to. Injected at build time by
 * wxt.config.ts (`__WEB_ORIGIN__` define): `http://localhost:3000` for
 * development, or the exact production origin passed via WEB_ORIGIN.
 */
declare const __WEB_ORIGIN__: string;

export const webOrigin: string = __WEB_ORIGIN__;

type FetchLike = typeof fetch;

export interface CloudClient {
  /** Query the website session. HttpOnly cookie travels with credentials. */
  getSession(): Promise<CloudSessionStatus>;
  /** Sign out the shared website session. */
  signOut(): Promise<CloudSignOutStatus>;
  /**
   * Upload a normalized Capture to the cloud library.
   * Returns the raw Response so callers apply the #28 error contract.
   */
  uploadCapture(capture: Capture): Promise<Response>;
}

interface GetSessionResponse {
  user?: {
    email?: string;
  } | null;
}

/**
 * All requests use `credentials: "include"` so the website's HttpOnly
 * session cookie is attached. The extension holds no tokens of its own.
 */
export function createCloudClient(
  origin: string,
  fetchImpl: FetchLike = fetch,
): CloudClient {
  async function request(path: string, init?: RequestInit): Promise<Response> {
    return fetchImpl(`${origin}${path}`, {
      ...init,
      credentials: "include",
    });
  }

  return {
    async getSession(): Promise<CloudSessionStatus> {
      try {
        const response = await request("/api/auth/get-session", {
          method: "GET",
        });
        if (!response.ok) {
          return { status: "unavailable" };
        }
        const body = (await response.json()) as GetSessionResponse | null;
        const email = body?.user?.email;
        return email ? { status: "signed-in", email } : { status: "signed-out" };
      } catch {
        return { status: "unavailable" };
      }
    },

    async signOut(): Promise<CloudSignOutStatus> {
      try {
        const response = await request("/api/auth/sign-out", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        return response.ok ? { status: "signed-out" } : { status: "error" };
      } catch {
        return { status: "error" };
      }
    },

    async uploadCapture(capture: Capture): Promise<Response> {
      return request("/api/v1/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capture),
      });
    },
  };
}

export const cloudClient: CloudClient = createCloudClient(webOrigin);
