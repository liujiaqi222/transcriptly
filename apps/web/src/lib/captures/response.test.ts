import { describe, expect, it } from "vitest";
import { errorResponse, successResponse } from "./response";

describe("capture responses", () => {
  it("returns the success envelope without caching", async () => {
    const response = successResponse({
      libraryItemId: "item-id",
      videoId: "dQw4w9WgXcQ",
      outcome: "created",
      currentCapturedAt: "2026-08-20T10:00:00.000Z",
      processedAt: "2026-08-20T10:00:01.000Z",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        libraryItemId: "item-id",
        videoId: "dQw4w9WgXcQ",
        outcome: "created",
        currentCapturedAt: "2026-08-20T10:00:00.000Z",
        processedAt: "2026-08-20T10:00:01.000Z",
      },
    });
  });

  it("returns stable machine-readable errors without caching", async () => {
    const response = errorResponse(401, {
      code: "unauthenticated",
      message: "A valid website session is required.",
      retryable: false,
      requestId: "request-id",
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "unauthenticated",
        message: "A valid website session is required.",
        retryable: false,
        requestId: "request-id",
      },
    });
  });
});
