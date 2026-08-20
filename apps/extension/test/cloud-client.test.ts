import type { Capture } from "@transcriptly/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudClient } from "../cloud/client";

const origin = "http://localhost:3000";

const capture: Capture = {
  source: {
    videoId: "abc123",
    url: "https://www.youtube.com/watch?v=abc123",
    title: "Ship It",
    channelName: "Ship It Weekly",
    channelUrl: "https://www.youtube.com/@shipitweekly",
    description: "An episode.",
  },
  capturedAt: "2026-08-20T10:30:00.000Z",
  segments: [{ start: 0, text: "Hello." }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("cloud client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a signed-in session with the user email", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ user: { email: "user@example.test" } }),
      );

    const client = createCloudClient(origin, fetchImpl);
    await expect(client.getSession()).resolves.toEqual({
      status: "signed-in",
      email: "user@example.test",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/get-session",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("reports signed-out when the website has no session", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(null));

    const client = createCloudClient(origin, fetchImpl);
    await expect(client.getSession()).resolves.toEqual({
      status: "signed-out",
    });
  });

  it("reports unavailable when the cloud cannot be reached", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("network down"));

    const client = createCloudClient(origin, fetchImpl);
    await expect(client.getSession()).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("signs out over POST with the session cookie", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));

    const client = createCloudClient(origin, fetchImpl);
    await expect(client.signOut()).resolves.toEqual({ status: "signed-out" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/sign-out",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("reports a sign-out error for non-ok responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Forbidden", { status: 403 }));

    const client = createCloudClient(origin, fetchImpl);
    await expect(client.signOut()).resolves.toEqual({ status: "error" });
  });

  it("uploads a capture as JSON with the session cookie", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));

    const client = createCloudClient(origin, fetchImpl);
    await client.uploadCapture(capture);

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/captures",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capture),
      }),
    );
  });
});
