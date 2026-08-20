import { captureSchema } from "@transcriptly/schema";
import { describe, expect, it } from "vitest";
import {
  contentTypeIsJson,
  MAX_CAPTURE_BYTES,
  validateCapturePayload,
} from "./validation";

const capture = {
  source: {
    videoId: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Title",
    channelName: "Channel",
    channelUrl: "https://www.youtube.com/@channel",
    description: "",
  },
  capturedAt: "2026-08-20T10:00:00.000Z",
  segments: [{ start: 0, text: "Hello" }],
};

describe("capture validation", () => {
  it("rejects unknown fields at every object boundary", () => {
    expect(
      captureSchema.safeParse({ ...capture, unexpected: true }).success,
    ).toBe(false);
    expect(
      captureSchema.safeParse({
        ...capture,
        source: { ...capture.source, unexpected: true },
      }).success,
    ).toBe(false);
    expect(
      captureSchema.safeParse({
        ...capture,
        segments: [{ start: 0, text: "Hello", unexpected: true }],
      }).success,
    ).toBe(false);
  });

  it("rejects malformed source, time and transcript entries", () => {
    expect(
      validateCapturePayload({
        ...capture,
        source: { ...capture.source, videoId: "short" },
      }).ok,
    ).toBe(false);
    expect(
      validateCapturePayload({ ...capture, capturedAt: "tomorrow" }).ok,
    ).toBe(false);
    expect(
      validateCapturePayload({
        ...capture,
        segments: [{ start: -1, text: "Hello" }],
      }).ok,
    ).toBe(false);
    expect(
      validateCapturePayload({
        ...capture,
        chapters: [{ start: 0, title: "" }],
      }).ok,
    ).toBe(false);
  });

  it("rejects captures more than ten minutes ahead of the server clock", () => {
    const result = validateCapturePayload(
      { ...capture, capturedAt: "2026-08-20T10:11:00.000Z" },
      new Date("2026-08-20T10:00:00.000Z"),
    );
    expect(result).toEqual(
      expect.objectContaining({ ok: false, code: "captured_at_in_future" }),
    );
  });

  it("accepts JSON media type parameters and rejects other media types", () => {
    expect(contentTypeIsJson("application/json; charset=utf-8")).toBe(true);
    expect(contentTypeIsJson("text/plain")).toBe(false);
    expect(contentTypeIsJson(null)).toBe(false);
  });

  it("keeps the body limit at exactly 10 MiB", () => {
    expect(MAX_CAPTURE_BYTES).toBe(10 * 1024 * 1024);
  });
});
