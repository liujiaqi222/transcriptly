import { describe, expect, it } from "vitest";
import {
  articleBlocks,
  formatTimestamp,
  timestampUrl,
  transcriptBlocks,
} from "./transcript";

describe("formatTimestamp", () => {
  it("formats sub-hour timestamps as MM:SS", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(61)).toBe("01:01");
    expect(formatTimestamp(3599)).toBe("59:59");
  });

  it("formats hour-plus timestamps as H:MM:SS", () => {
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3724)).toBe("1:02:04");
  });
});

describe("timestampUrl", () => {
  it("appends the standard seconds-suffix deep link", () => {
    expect(
      timestampUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", 61),
    ).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=61s");
  });
});

describe("transcriptBlocks", () => {
  it("interleaves chapters before their first segment and drops trailing chapters", () => {
    const blocks = transcriptBlocks({
      segments: [
        { start: 0, text: "intro line" },
        { start: 10, text: "middle line" },
        { start: 20, text: "final line" },
      ],
      chapters: [
        { start: 0, title: "Opening" },
        { start: 10, title: "Deep dive" },
        { start: 30, title: "After the last segment" },
      ],
    });

    expect(blocks).toEqual([
      { kind: "chapter", title: "Opening" },
      { kind: "segment", start: 0, text: "intro line" },
      { kind: "chapter", title: "Deep dive" },
      { kind: "segment", start: 10, text: "middle line" },
      { kind: "segment", start: 20, text: "final line" },
    ]);
  });

  it("returns segments only when there are no chapters", () => {
    const blocks = transcriptBlocks({
      segments: [{ start: 0, text: "only line" }],
      chapters: [],
    });

    expect(blocks).toEqual([{ kind: "segment", start: 0, text: "only line" }]);
  });
});

describe("articleBlocks", () => {
  it("preserves English segment order and text while preferring sentence endings", () => {
    const longPrefix = "alpha ".repeat(39);
    const blocks = articleBlocks({
      segments: [
        { start: 0, text: longPrefix },
        { start: 10, text: "sentence ends here." },
        { start: 15, text: "next paragraph" },
      ],
      chapters: [],
    });

    expect(blocks).toEqual([
      {
        kind: "paragraph",
        start: 0,
        text: `${longPrefix}sentence ends here.`,
      },
      { kind: "paragraph", start: 15, text: "next paragraph" },
    ]);
  });

  it("joins CJK captions without injecting spaces and recognizes CJK punctuation", () => {
    const blocks = articleBlocks({
      segments: [
        { start: 0, text: "这是第一段" },
        { start: 5, text: `${"很长的内容".repeat(50)}。` },
        { start: 10, text: "这是下一段" },
      ],
      chapters: [],
    });

    expect(blocks).toEqual([
      {
        kind: "paragraph",
        start: 0,
        text: `这是第一段${"很长的内容".repeat(50)}。`,
      },
      { kind: "paragraph", start: 10, text: "这是下一段" },
    ]);
  });

  it("never merges text across Chapter boundaries", () => {
    const blocks = articleBlocks({
      segments: [
        { start: 0, text: "hello" },
        { start: 5, text: "world" },
        { start: 10, text: "core starts" },
      ],
      chapters: [
        { start: 0, title: "Intro" },
        { start: 10, title: "Core" },
      ],
    });

    expect(blocks).toEqual([
      { kind: "chapter", title: "Intro" },
      { kind: "paragraph", start: 0, text: "hello world" },
      { kind: "chapter", title: "Core" },
      { kind: "paragraph", start: 10, text: "core starts" },
    ]);
  });

  it("returns no Article blocks for an empty edge input", () => {
    expect(articleBlocks({ segments: [], chapters: [] })).toEqual([]);
  });
});
