import { describe, expect, it } from "vitest";
import { formatTimestamp, timestampUrl, transcriptBlocks } from "./transcript";

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
