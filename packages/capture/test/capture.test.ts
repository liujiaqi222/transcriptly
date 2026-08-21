// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureSchema } from "@transcriptly/schema";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  CaptureError,
  capture,
  captureOutcome,
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

    const container = doc.querySelector("#segments-container");
    if (!container) {
      throw new Error("Missing #segments-container");
    }
    const template = doc.querySelector(
      "#transcript-segments",
    ) as HTMLTemplateElement;
    const button = doc.querySelector(
      "ytd-video-description-transcript-section-renderer button",
    );
    if (!button) {
      throw new Error("Missing transcript button");
    }

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

  it("returns title, channel, URL, description, and duration when available", async () => {
    const doc = loadDocument("watch-open.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.source.videoId).toBe("dQw4w9WgXcQ");
    expect(result.source.url).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result.source.title).toBe("Rust for TypeScript Developers");
    expect(result.source.channelName).toBe("Crab People");
    expect(result.source.channelUrl).toBe(
      "https://www.youtube.com/@crabpeople",
    );
    expect(result.source.description).toBe("Borrow checker without the tears.");
    expect(result.source.durationSeconds).toBe(1391);
    expect(result.source.publishedAt).toBe("2025-01-15T00:00:00.000Z");
    expect(result.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("prefers live DOM metadata over stale head meta tags after SPA navigation", async () => {
    const doc = loadDocument("watch-spa-stale-meta.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.source.title).toBe("Fresh Title from DOM");
    expect(result.source.channelName).toBe("Fresh Channel");
    expect(result.source.channelUrl).toBe(
      "https://www.youtube.com/@freshchannel",
    );
    expect(result.source.description).toBe("Fresh description from DOM.");
    expect(result.source.publishedAt).toBe("2009-10-24T00:00:00.000Z");
    expect(result.source.durationSeconds).toBe(245);
  });

  it("produces captures accepted by the shared runtime schema", async () => {
    for (const fixture of ["watch-open.html", "watch-spa-stale-meta.html"]) {
      const result = await capture(
        loadDocument(fixture),
        WATCH_URL,
        QUICK_OPTIONS,
      );
      expect(captureSchema.safeParse(result).success).toBe(true);
    }
  });

  it("reads a text-only joint channel name without inventing a channel URL", async () => {
    const doc = loadDocument("watch-open.html");
    const channelUrl = doc.querySelector('link[itemprop="url"]');
    if (!channelUrl) throw new Error("Missing channel URL metadata");
    channelUrl.setAttribute(
      "href",
      "https://www.youtube.com/watch?v=KCjwU4XYBL8",
    );

    const attributedChannel = doc.createElement("div");
    attributedChannel.id = "attributed-channel-name";
    attributedChannel.innerHTML =
      '<a role="button">Open Residency和AI with Remy</a>';
    doc.body.append(attributedChannel);

    const initialData = doc.createElement("script");
    initialData.textContent = `var ytInitialData = ${JSON.stringify({
      contents: {
        videoOwnerRenderer: {
          navigationEndpoint: {
            showDialogCommand: {
              panelLoadingStrategy: {
                inlineContent: {
                  dialogViewModel: {
                    customContent: {
                      listViewModel: {
                        listItems: [
                          {
                            listItemViewModel: {
                              title: {
                                content: "Open Residency",
                                commandRuns: [
                                  {
                                    onTap: {
                                      innertubeCommand: {
                                        browseEndpoint: {
                                          canonicalBaseUrl: "/@openresidency",
                                        },
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })}`;
    doc.body.append(initialData);

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.source.channelName).toBe("Open Residency");
    expect(result.source.channelUrl).toBe(
      "https://www.youtube.com/@openresidency",
    );
    expect(captureSchema.safeParse(result).success).toBe(true);
  });

  it("reads already-rendered segments without opening the panel", async () => {
    const doc = loadDocument("watch-open.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.segments.map((s) => s.start)).toEqual([0, 9, 42]);
    expect(result.segments[2].text).toBe(
      "so you can stop fighting the compiler",
    );
  });

  it("captures rendered Chinese segments from YouTube's current in-video panel", async () => {
    const doc = loadDocument("watch-current-transcript-panel.html");

    const result = await capture(doc, WATCH_URL, { timeoutMs: 0 });

    expect(result.segments).toEqual([
      { start: 0, text: "大家好，我是肖恩 最近，记忆在AI智能体系统中非常流行" },
      { start: 6, text: "任何LLM调用都不会长期携带任何记忆权重" },
      { start: 12, text: "后续章节也必须被保存" },
    ]);
  });

  it("does not double-count segments when the expanded engagement panel nests the segments container", async () => {
    // The segmentsContainer selector list matches both the expanded panel's
    // #contents and the nested #segments-container; the nested one must not
    // re-emit the same segments (seen in production as a transcript stored
    // twice with the time index restarting at 0).
    const doc = loadDocument("watch-open.html");

    const result = await capture(doc, WATCH_URL, QUICK_OPTIONS);

    expect(result.segments).toHaveLength(3);
    expect(result.segments.map((s) => s.start)).toEqual([0, 9, 42]);
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
    const body = markdown.slice(
      markdown.indexOf("---", markdown.indexOf("---") + 3),
    );
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
