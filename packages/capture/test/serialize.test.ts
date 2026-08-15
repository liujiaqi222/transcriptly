import { describe, expect, it } from "vitest";
import type { Capture, CaptureSource, CaptureSegment } from "@transcriptly/schema";
import { formatTimestamp, serializeToMarkdown } from "../src/serialize";

interface Overrides {
  source?: Partial<CaptureSource>;
  capturedAt?: string;
  segments?: CaptureSegment[];
}

function makeCapture(overrides: Overrides = {}): Capture {
  return {
    source: {
      videoId: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "A Practical Guide to Agents",
      channelName: "Ship It Weekly",
      channelUrl: "https://www.youtube.com/@shipitweekly",
      description: "Engineering lessons behind production agent systems.",
      ...overrides.source,
    },
    capturedAt: overrides.capturedAt ?? "2024-08-15T14:32:00.000Z",
    segments: overrides.segments ?? [
      { start: 0, text: "so you've been building agents" },
      { start: 61, text: "and you keep hitting the same walls" },
      { start: 3724, text: "that's all for today, thanks for watching" },
    ],
  };
}

describe("serializeToMarkdown", () => {
  it("emits required source metadata in the frontmatter", () => {
    const markdown = serializeToMarkdown(
      makeCapture({
        source: {
          publishedAt: "2024-08-01",
          language: "English",
          durationSeconds: 3725,
        },
      }),
    );

    expect(markdown).toContain('title: "A Practical Guide to Agents"');
    expect(markdown).toContain('channelName: "Ship It Weekly"');
    expect(markdown).toContain('channelUrl: "https://www.youtube.com/@shipitweekly"');
    expect(markdown).toContain('url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(markdown).toContain('videoId: "dQw4w9WgXcQ"');
    expect(markdown).toContain('capturedAt: "2024-08-15T14:32:00.000Z"');
    expect(markdown).toContain('publishedAt: "2024-08-01"');
    expect(markdown).toContain('language: "English"');
    expect(markdown).toContain("durationSeconds: 3725");
  });

  it("omits absent optional metadata from the frontmatter", () => {
    const markdown = serializeToMarkdown(makeCapture());

    expect(markdown).not.toContain("publishedAt");
    expect(markdown).not.toContain("language:");
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
      "- [00:00](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0) so you've been building agents",
    );
    expect(markdown).toContain(
      "- [01:01](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=61) and you keep hitting the same walls",
    );
    expect(markdown).toContain(
      "- [1:02:04](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3724) that's all for today, thanks for watching",
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

    const body = markdown.slice(markdown.indexOf("---", markdown.indexOf("---") + 3));
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
