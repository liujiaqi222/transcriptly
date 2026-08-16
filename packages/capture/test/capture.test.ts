// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  capture,
  captureOutcome,
  CaptureError,
  serializeToMarkdown,
} from "../src/index";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function loadDocument(name: string): Document {
  return new JSDOM(readFixture(name)).window.document;
}

const WATCH_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const QUICK_OPTIONS = { timeoutMs: 2000, pollIntervalMs: 10 };

describe("capture", () => {
  it("expands a collapsed transcript panel and returns ordered integer-second segments", async () => {
    const dom = new JSDOM(readFixture("watch-collapsed.html"));
    const doc = dom.window.document;

    const container = doc.querySelector("#segments-container")!;
    const template = doc.querySelector(
      "#transcript-segments",
    ) as HTMLTemplateElement;
    const button = doc.querySelector(
      "ytd-video-description-transcript-section-renderer button",
    )!;

    button.addEventListener("click", () => {
      setTimeout(() => {
        container.replaceChildren(template.content.cloneNode(true));
      }, 20);
    });

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.segments).toHaveLength(4);
    expect(result.segments.map((s) => s.start)).toEqual([0, 5, 61, 3724]);
    for (const segment of result.segments) {
      expect(Number.isInteger(segment.start)).toBe(true);
    }
    expect(result.segments.map((s) => s.text)).toEqual([
      "so you've been building agents",
      "and you keep hitting the same walls",
      "so let's fix the core loop first",
      "that's all for today, thanks for watching",
    ]);
  });

  it("returns title, channel, URL, description, language, and duration when available", async () => {
    const doc = loadDocument("watch-open.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.source.videoId).toBe("dQw4w9WgXcQ");
    expect(result.source.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.source.title).toBe("Rust for TypeScript Developers");
    expect(result.source.channelName).toBe("Crab People");
    expect(result.source.channelUrl).toBe("https://www.youtube.com/@crabpeople");
    expect(result.source.description).toBe("Borrow checker without the tears.");
    expect(result.source.language).toBe("en");
    expect(result.source.durationSeconds).toBe(1391);
    expect(result.source.publishedAt).toBe("2025-01-15");
    expect(result.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("reads already-rendered segments without opening the panel", async () => {
    const doc = loadDocument("watch-open.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.segments.map((s) => s.start)).toEqual([0, 9, 42]);
    expect(result.segments[2].text).toBe(
      "so you can stop fighting the compiler",
    );
  });

  it("captures CJK transcript text in order", async () => {
    const doc = loadDocument("cjk.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.segments).toHaveLength(8);
    expect(result.segments[0].text).toBe("大家好，今天我们来聊分布式系统");
    expect(result.segments[7].text).toBe("最后我们看看实际系统中的坑");
    const starts = result.segments.map((s) => s.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it("captures chapter titles and associates them with segment start times", async () => {
    const doc = loadDocument("watch-chapters.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.chapters).toEqual([
      { start: 0, title: "Introduction" },
      { start: 11, title: "Spec & Scope" },
      { start: 52, title: "Ship It" },
    ]);
    expect(result.segments).toHaveLength(6);
  });

  it("falls back to the description chapters panel when the transcript has no section headers", async () => {
    const doc = loadDocument("watch-markers.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.chapters).toEqual([
      { start: 0, title: "Intro" },
      { start: 25, title: "How we're used to learning" },
      { start: 55, title: "One teaches many" },
    ]);
  });

  it("fails explicitly with no-transcript when the panel is unavailable", async () => {
    const doc = loadDocument("no-transcript.html");

    await expect(capture(doc, WATCH_URL, QUICK_OPTIONS)).rejects.toMatchObject({
      name: "CaptureError",
      kind: "no-transcript",
    });
  });

  it("fails explicitly with malformed-segments on broken timestamps", async () => {
    const doc = loadDocument("malformed-segments.html");

    await expect(capture(doc, WATCH_URL, QUICK_OPTIONS)).rejects.toMatchObject({
      name: "CaptureError",
      kind: "malformed-segments",
    });
  });

  it("fails explicitly with not-a-watch-page for non-video URLs", async () => {
    const doc = loadDocument("watch-open.html");

    await expect(
      capture(doc, "https://www.youtube.com/feed/subscriptions", QUICK_OPTIONS),
    ).rejects.toMatchObject({
      name: "CaptureError",
      kind: "not-a-watch-page",
    });
  });

  it("sanitizes untrusted text into inert plain strings before leaving the boundary", async () => {
    const doc = loadDocument("untrusted.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.source.title).toBe(
      "Totally <script>alert(1)</script> Normal & Title",
    );
    expect(result.source.channelName).toBe("Evil <b>Channel</b>");
    expect(result.source.description).toBe(
      "Desc <img src=x onerror=alert(1)> injection & more",
    );
    expect(result.segments[0].text).toBe(
      "<script>alert(1)</script> and <img src=x onerror=alert(2)>",
    );

    const markdown = serializeToMarkdown(result);
    const body = markdown.slice(markdown.indexOf("---", markdown.indexOf("---") + 3));
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("<img");
    expect(body).not.toContain("<b>");
  });
});

describe("CaptureError", () => {
  it("carries a failure kind", () => {
    const error = new CaptureError("no-transcript", "boom");
    expect(error.kind).toBe("no-transcript");
    expect(error.message).toBe("boom");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("captureOutcome", () => {
  it("returns an ok outcome for a valid fixture", async () => {
    const doc = loadDocument("watch-open.html");

    const result = await captureOutcome(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.capture.segments).toHaveLength(3);
  });

  it("returns a serializable failure outcome instead of throwing", async () => {
    const doc = loadDocument("no-transcript.html");

    const result = await captureOutcome(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("no-transcript");
      expect(result.message).toBeTruthy();
    }
    expect(JSON.stringify(result)).toContain("no-transcript");
  });
});
