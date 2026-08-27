import type { Capture } from "@transcriptly/schema";
import { describe, expect, it } from "vitest";
import {
  isStructuralRejection,
  validatePublicContributionPayload,
} from "./validation";

function capture(overrides: Partial<Capture> = {}): Capture {
  return {
    source: {
      videoId: "abc12345678",
      url: "https://www.youtube.com/watch?v=abc12345678",
      title: "A complete transcript",
      channelName: "Transcriptly Lab",
      channelUrl: "https://www.youtube.com/@transcriptly",
      description: "A public contribution fixture.",
      durationSeconds: 120,
    },
    capturedAt: "2026-08-26T08:00:00.000Z",
    segments: [
      { start: 0, text: "First segment" },
      { start: 60, text: "Second segment" },
    ],
    chapters: [{ start: 0, title: "Start" }],
    ...overrides,
  };
}

describe("public contribution validation", () => {
  it("accepts a complete capture with matching target identity", () => {
    const result = validatePublicContributionPayload(
      {
        capture: capture(),
        targetVideoId: "abc12345678",
        confirmPublicProfile: true,
      },
      new Date("2026-08-26T08:01:00.000Z"),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a capture for a different target video", () => {
    const result = validatePublicContributionPayload(
      { capture: capture(), targetVideoId: "zzzzzzzzzzz" },
      new Date("2026-08-26T08:01:00.000Z"),
    );
    expect(result).toMatchObject({
      ok: false,
      code: "target_video_mismatch",
    });
  });

  it("rejects unordered segment or chapter timelines", () => {
    const unorderedSegments = validatePublicContributionPayload(
      {
        capture: capture({
          segments: [
            { start: 60, text: "Later" },
            { start: 10, text: "Earlier" },
          ],
        }),
        targetVideoId: "abc12345678",
      },
      new Date("2026-08-26T08:01:00.000Z"),
    );
    const unorderedChapters = validatePublicContributionPayload(
      {
        capture: capture({
          chapters: [
            { start: 40, title: "Later" },
            { start: 20, title: "Earlier" },
          ],
        }),
        targetVideoId: "abc12345678",
      },
      new Date("2026-08-26T08:01:00.000Z"),
    );
    expect(unorderedSegments).toMatchObject({
      ok: false,
      code: "invalid_timeline",
    });
    expect(unorderedChapters).toMatchObject({
      ok: false,
      code: "invalid_timeline",
    });
  });

  it("rejects timeline entries beyond a known duration", () => {
    const result = validatePublicContributionPayload(
      {
        capture: capture({
          segments: [{ start: 121, text: "Outside the video" }],
        }),
        targetVideoId: "abc12345678",
      },
      new Date("2026-08-26T08:01:00.000Z"),
    );
    expect(result).toMatchObject({ ok: false, code: "invalid_timeline" });
  });

  it("rejects an empty transcript with a specific code", () => {
    const result = validatePublicContributionPayload(
      {
        capture: capture({ segments: [] }),
        targetVideoId: "abc12345678",
      },
      new Date("2026-08-26T08:01:00.000Z"),
    );
    expect(result).toMatchObject({ ok: false, code: "empty_transcript" });
  });

  it("rejects a whole-transcript duplication with a specific code", () => {
    const doubled = [
      { start: 0, text: "First segment" },
      { start: 60, text: "Second segment" },
      { start: 0, text: "First segment" },
      { start: 60, text: "Second segment" },
    ];
    const result = validatePublicContributionPayload(
      {
        capture: capture({ segments: doubled }),
        targetVideoId: "abc12345678",
      },
      new Date("2026-08-26T08:01:00.000Z"),
    );
    expect(result).toMatchObject({ ok: false, code: "duplicate_transcript" });
  });

  it("accepts an even segment count that is not a duplication", () => {
    const result = validatePublicContributionPayload(
      {
        capture: capture({
          segments: [
            { start: 0, text: "One" },
            { start: 10, text: "Two" },
            { start: 20, text: "Three" },
            { start: 30, text: "Four" },
          ],
        }),
        targetVideoId: "abc12345678",
      },
      new Date("2026-08-26T08:01:00.000Z"),
    );
    expect(result.ok).toBe(true);
  });

  it("does not flag near-duplicate halves that differ in text", () => {
    const result = validatePublicContributionPayload(
      {
        capture: capture({
          segments: [
            { start: 0, text: "One" },
            { start: 10, text: "Two" },
            { start: 20, text: "Uno" },
            { start: 30, text: "Due" },
          ],
        }),
        targetVideoId: "abc12345678",
      },
      new Date("2026-08-26T08:01:00.000Z"),
    );
    expect(result.ok).toBe(true);
  });

  it("keeps payload-shape failures out of the structural 422 set", () => {
    // Only provable structural faults reject with 422; malformed payloads
    // stay 400s so the status mapping cannot drift from the code union.
    for (const code of [
      "invalid_capture",
      "captured_at_in_future",
      "unsupported_media_type",
      "payload_too_large",
    ]) {
      expect(isStructuralRejection(code)).toBe(false);
    }
    expect(isStructuralRejection("target_video_mismatch")).toBe(true);
    expect(isStructuralRejection("empty_transcript")).toBe(true);
    expect(isStructuralRejection("invalid_timeline")).toBe(true);
    expect(isStructuralRejection("duplicate_transcript")).toBe(true);
  });
});
