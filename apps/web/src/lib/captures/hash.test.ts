import { describe, expect, it } from "vitest";
import { transcriptContentHash } from "./hash";

const base = {
  source: {
    videoId: "dQw4w9WgXcQ",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Title",
    channelName: "Channel",
    channelUrl: "https://www.youtube.com/@channel",
    description: "Description",
  },
  capturedAt: "2026-08-20T10:00:00.000Z",
  segments: [{ start: 0, text: "Hello" }],
};

describe("transcript content hash", () => {
  it("ignores source metadata and capturedAt", () => {
    const first = transcriptContentHash(base);
    const second = transcriptContentHash({
      ...base,
      capturedAt: "2026-08-21T10:00:00.000Z",
      source: { ...base.source, title: "Different title" },
    });
    expect(second).toBe(first);
  });

  it("treats missing chapters and an empty chapter list equally", () => {
    expect(transcriptContentHash(base)).toBe(
      transcriptContentHash({ ...base, chapters: [] }),
    );
  });

  it("includes segment and chapter order and text", () => {
    expect(
      transcriptContentHash({
        ...base,
        segments: [
          { start: 1, text: "One" },
          { start: 2, text: "Two" },
        ],
      }),
    ).not.toBe(
      transcriptContentHash({
        ...base,
        segments: [
          { start: 2, text: "Two" },
          { start: 1, text: "One" },
        ],
      }),
    );
  });
});
