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
    channelHandle: "/@shipitweekly",
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
    // Fresh Response per call: parallel requests each consume their own body.
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      ).pathname;
      if (url.endsWith("/api/v1/contributions/status")) {
        return Promise.resolve(jsonResponse({ success: true }));
      }
      return Promise.resolve(
        jsonResponse({ user: { email: "user@example.test" } }),
      );
    });

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

  it("loads the one-time public contribution status for a signed-in user", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            email: "user@example.test",
            name: "Public Name",
            image: "https://example.test/avatar.png",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            confirmed: true,
            displayName: "Public Name",
            avatarUrl: "https://example.test/avatar.png",
          },
        }),
      );

    await expect(
      createCloudClient(origin, fetchImpl).getSession(),
    ).resolves.toEqual({
      status: "signed-in",
      email: "user@example.test",
      displayName: "Public Name",
      avatarUrl: "https://example.test/avatar.png",
      publicContributionConfirmed: true,
    });
  });

  it("keeps the session signed-in when the contribution status fails", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ user: { email: "user@example.test" } }),
      )
      .mockRejectedValue(new TypeError("status endpoint down"));

    await expect(
      createCloudClient(origin, fetchImpl).getSession(),
    ).resolves.toEqual({
      status: "signed-in",
      email: "user@example.test",
    });
  });

  it("reports signed-out when the website has no session", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(jsonResponse(null)));

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
      "http://localhost:3000/api/v1/contributions",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capture,
          targetVideoId: capture.source.videoId,
        }),
      }),
    );
  });
});
