import type {
  Capture,
  CaptureChapter,
  CaptureSegment,
  CaptureSource,
} from "@transcriptly/schema";
import { describe, expect, it } from "vitest";
import {
  articleBlocks,
  formatTimestamp,
  serializeToMarkdown,
  transcriptBlocks,
} from "../src/serialize";

interface Overrides {
  source?: Partial<CaptureSource>;
  capturedAt?: string;
  segments?: CaptureSegment[];
  chapters?: CaptureChapter[];
}

function makeCapture(overrides: Overrides = {}): Capture {
  return {
    source: {
      videoId: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "A Practical Guide to Agents",
      channelName: "Ship It Weekly",
      channelHandle: "/@shipitweekly",
      description: "Engineering lessons behind production agent systems.",
      ...overrides.source,
    },
    capturedAt: overrides.capturedAt ?? "2024-08-15T14:32:00.000Z",
    segments: overrides.segments ?? [
      { start: 0, text: "so you've been building agents" },
      { start: 61, text: "and you keep hitting the same walls" },
      { start: 3724, text: "that's all for today, thanks for watching" },
    ],
    ...(overrides.chapters !== undefined
      ? { chapters: overrides.chapters }
      : {}),
  };
}

describe("serializeToMarkdown", () => {
  it("emits required source metadata in the frontmatter", () => {
    const markdown = serializeToMarkdown(
      makeCapture({
        source: {
          publishedAt: "2024-08-01",
          durationSeconds: 3725,
        },
      }),
    );

    expect(markdown).toContain('title: "A Practical Guide to Agents"');
    expect(markdown).toContain('channelName: "Ship It Weekly"');
    expect(markdown).toContain(
      'channelUrl: "https://www.youtube.com/@shipitweekly"',
    );
    expect(markdown).toContain(
      'url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"',
    );
    expect(markdown).toContain('videoId: "dQw4w9WgXcQ"');
    expect(markdown).toContain('capturedAt: "2024-08-15T14:32:00.000Z"');
    expect(markdown).toContain('publishedAt: "2024-08-01"');
    expect(markdown).toContain("durationSeconds: 3725");
  });

  it("omits absent optional metadata from the frontmatter", () => {
    const markdown = serializeToMarkdown(makeCapture());

    expect(markdown).not.toContain("publishedAt");
    expect(markdown).not.toContain("durationSeconds");
  });

  it("includes source attribution linking the title back to the video", () => {
    const markdown = serializeToMarkdown(makeCapture());

    expect(markdown).toContain(
      "**Source:** [A Practical Guide to Agents](https://www.youtube.com/watch?v=dQw4w9WgXcQ) — Ship It Weekly",
    );
  });

  it("includes the description in the body", () => {
    const markdown = serializeToMarkdown(makeCapture());

    expect(markdown).toContain(
      "> Engineering lessons behind production agent systems.",
    );
  });

  it("preserves segment order and emits integer-second timestamp jump links", () => {
    const markdown = serializeToMarkdown(makeCapture());

    const first = markdown.indexOf("so you've been building agents");
    const second = markdown.indexOf("and you keep hitting the same walls");
    const third = markdown.indexOf("that's all for today, thanks for watching");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);

    expect(markdown).toContain(
      "- [00:00](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0s) so you've been building agents",
    );
    expect(markdown).toContain(
      "- [01:01](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=61s) and you keep hitting the same walls",
    );
    expect(markdown).toContain(
      "- [1:02:04](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3724s) that's all for today, thanks for watching",
    );
  });

  it("escapes untrusted HTML in the rendered body", () => {
    const markdown = serializeToMarkdown(
      makeCapture({
        source: {
          title: "Title <script>alert(1)</script>",
          channelName: "Channel & Co",
          description: "Desc <img src=x onerror=alert(1)>",
        },
        segments: [{ start: 0, text: "segment <b>bold</b>" }],
      }),
    );

    expect(markdown).toContain("# Title &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markdown).toContain("— Channel &amp; Co");
    expect(markdown).toContain("> Desc &lt;img src=x onerror=alert(1)&gt;");
    expect(markdown).toContain("segment &lt;b&gt;bold&lt;/b&gt;");

    const body = markdown.slice(
      markdown.indexOf("---", markdown.indexOf("---") + 3),
    );
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("<img");
    expect(body).not.toContain("<b>");
  });

  it("keeps untrusted Markdown link, image, and emphasis syntax inert", () => {
    const markdown = serializeToMarkdown(
      makeCapture({
        segments: [
          { start: 0, text: "see [this](javascript:alert(1)) and ![img](x)" },
          { start: 5, text: "**bold** and _em_" },
        ],
      }),
    );

    expect(markdown).toContain("\\[this\\](javascript:alert(1))");
    expect(markdown).toContain("!\\[img\\](x)");
    expect(markdown).toContain("\\*\\*bold\\*\\*");
    expect(markdown).toContain("\\_em\\_");
    expect(markdown).not.toContain("[this](javascript:alert(1))");
  });

  it("escapes quotes and newlines in frontmatter values", () => {
    const markdown = serializeToMarkdown(
      makeCapture({
        source: {
          title: 'He said "no"',
          description: "line one\nline two",
        },
      }),
    );

    expect(markdown).toContain('title: "He said \\"no\\""');
    expect(markdown).toContain("> line one");
    expect(markdown).toContain("> line two");
  });

  it("emits chapter titles as third-level headings before their segments", () => {
    const markdown = serializeToMarkdown(
      makeCapture({
        chapters: [
          { start: 0, title: "Intro" },
          { start: 61, title: "The Core Loop" },
        ],
        segments: [
          { start: 0, text: "hello" },
          { start: 5, text: "world" },
          { start: 61, text: "core" },
        ],
      }),
    );

    const intro = markdown.indexOf("### Intro");
    const hello = markdown.indexOf("- [00:00]");
    const coreHeading = markdown.indexOf("### The Core Loop");
    const coreSegment = markdown.indexOf("- [01:01]");
    expect(intro).toBeGreaterThan(-1);
    expect(hello).toBeGreaterThan(intro);
    expect(coreHeading).toBeGreaterThan(hello);
    expect(coreSegment).toBeGreaterThan(coreHeading);
  });

  it("escapes untrusted chapter titles", () => {
    const markdown = serializeToMarkdown(
      makeCapture({
        chapters: [{ start: 0, title: "Chapter <script>alert(1)</script>" }],
      }),
    );

    expect(markdown).toContain(
      "### Chapter &lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(markdown).not.toContain("### Chapter <script>");
  });

  it("keeps Timeline output as the default and supports the explicit format", () => {
    const implicit = serializeToMarkdown(makeCapture());
    const explicit = serializeToMarkdown(makeCapture(), "timeline");

    expect(explicit).toBe(implicit);
    expect(implicit).toContain("- [00:00]");
  });

  it("renders Article paragraphs with one start timestamp and no list marker", () => {
    const markdown = serializeToMarkdown(
      makeCapture({
        segments: [
          { start: 0, text: "First sentence." },
          { start: 5, text: "Second sentence." },
        ],
      }),
      "article",
    );

    expect(markdown).toContain(
      "[00:00](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0s) First sentence. Second sentence.",
    );
    expect(markdown).not.toContain("- [00:00]");
    expect(markdown).not.toContain("[00:05]");
  });
});

describe("articleBlocks", () => {
  it("preserves English segment order and text while preferring sentence endings", () => {
    const longPrefix = "alpha ".repeat(39);
    const blocks = articleBlocks(
      makeCapture({
        segments: [
          { start: 0, text: longPrefix },
          { start: 10, text: "sentence ends here." },
          { start: 15, text: "next paragraph" },
        ],
      }),
    );

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
    const blocks = articleBlocks(
      makeCapture({
        segments: [
          { start: 0, text: "这是第一段" },
          { start: 5, text: `${"很长的内容".repeat(50)}。` },
          { start: 10, text: "这是下一段" },
        ],
      }),
    );

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
    const blocks = articleBlocks(
      makeCapture({
        chapters: [
          { start: 0, title: "Intro" },
          { start: 10, title: "Core" },
        ],
        segments: [
          { start: 0, text: "hello" },
          { start: 5, text: "world" },
          { start: 10, text: "core starts" },
        ],
      }),
    );

    expect(blocks).toEqual([
      { kind: "chapter", title: "Intro" },
      { kind: "paragraph", start: 0, text: "hello world" },
      { kind: "chapter", title: "Core" },
      { kind: "paragraph", start: 10, text: "core starts" },
    ]);
  });

  it("bounds punctuation-poor captions by time and text size", () => {
    const textBlocks = articleBlocks(
      makeCapture({
        segments: [
          { start: 0, text: "a".repeat(400) },
          { start: 10, text: "b".repeat(400) },
          { start: 20, text: "tail" },
        ],
      }),
    );
    const timeBlocks = articleBlocks(
      makeCapture({
        segments: [
          { start: 0, text: "first" },
          { start: 61, text: "second" },
        ],
      }),
    );

    expect(textBlocks).toHaveLength(2);
    expect(textBlocks[0]).toMatchObject({ start: 0, text: "a".repeat(400) });
    expect(textBlocks[1]).toMatchObject({ start: 10 });
    expect(timeBlocks).toEqual([
      { kind: "paragraph", start: 0, text: "first" },
      { kind: "paragraph", start: 61, text: "second" },
    ]);
  });

  it("backs up to an internal sentence boundary before the hard text limit", () => {
    const blocks = articleBlocks(
      makeCapture({
        segments: [
          {
            start: 0,
            text: "lead ".repeat(80),
          },
          { start: 20, text: "comfort. Not" },
          { start: 27, text: "going should remain with this sentence" },
          { start: 30, text: "more context ".repeat(20) },
        ],
      }),
    );

    expect(blocks[0]).toMatchObject({
      kind: "paragraph",
      start: 0,
      text: expect.stringMatching(/comfort\.$/),
    });
    expect(blocks[1]).toMatchObject({
      kind: "paragraph",
      start: 20,
      text: expect.stringMatching(/^Not going should remain/),
    });
  });

  it("returns no Article blocks for an empty edge input", () => {
    expect(articleBlocks(makeCapture({ segments: [] }))).toEqual([]);
  });
});

describe("transcriptBlocks", () => {
  it("interleaves chapters before their first segment and drops trailing chapters", () => {
    const blocks = transcriptBlocks(
      makeCapture({
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
      }),
    );

    expect(blocks).toEqual([
      { kind: "chapter", title: "Opening" },
      { kind: "segment", start: 0, text: "intro line" },
      { kind: "chapter", title: "Deep dive" },
      { kind: "segment", start: 10, text: "middle line" },
      { kind: "segment", start: 20, text: "final line" },
    ]);
  });

  it("returns segments only when a capture has no chapters", () => {
    const blocks = transcriptBlocks(
      makeCapture({
        segments: [{ start: 0, text: "only line" }],
      }),
    );

    expect(blocks).toEqual([{ kind: "segment", start: 0, text: "only line" }]);
  });
});

describe("formatTimestamp", () => {
  it("formats sub-hour timestamps as MM:SS", () => {
    expect(formatTimestamp(0)).toBe("00:00");
    expect(formatTimestamp(9)).toBe("00:09");
    expect(formatTimestamp(61)).toBe("01:01");
    expect(formatTimestamp(3599)).toBe("59:59");
  });

  it("formats hour-plus timestamps as H:MM:SS", () => {
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3724)).toBe("1:02:04");
  });
});
