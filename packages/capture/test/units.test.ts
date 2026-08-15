import { describe, expect, it } from "vitest";
import { sanitizeText } from "../src/sanitize";
import { parseDuration, parseTimestamp } from "../src/timestamp";
import { canonicalWatchUrl, parseVideoId } from "../src/video";

describe("parseTimestamp", () => {
  it("parses mm:ss and h:mm:ss into integer seconds", () => {
    expect(parseTimestamp("0:00")).toBe(0);
    expect(parseTimestamp("0:05")).toBe(5);
    expect(parseTimestamp("10:30")).toBe(630);
    expect(parseTimestamp("1:01")).toBe(61);
    expect(parseTimestamp("59:59")).toBe(3599);
    expect(parseTimestamp("1:02:04")).toBe(3724);
    expect(parseTimestamp("2:00:00")).toBe(7200);
  });

  it("parses bare seconds", () => {
    expect(parseTimestamp("42")).toBe(42);
    expect(parseTimestamp("0")).toBe(0);
  });

  it("returns null for malformed timestamps", () => {
    expect(parseTimestamp("not-a-time")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
    expect(parseTimestamp("-5")).toBeNull();
    expect(parseTimestamp("1:2:3:4")).toBeNull();
  });
});

describe("parseDuration", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseDuration("PT4M13S")).toBe(253);
    expect(parseDuration("PT1H2M4S")).toBe(3724);
    expect(parseDuration("PT23M11S")).toBe(1391);
    expect(parseDuration("PT1M")).toBe(60);
    expect(parseDuration("PT1H")).toBe(3600);
    expect(parseDuration("PT45S")).toBe(45);
  });

  it("returns null for malformed durations", () => {
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("garbage")).toBeNull();
  });
});

describe("sanitizeText", () => {
  it("strips control characters and the delete character", () => {
    expect(sanitizeText("a\u0000b\u0007c\u007Fd")).toBe("abcd");
    expect(sanitizeText("tab\there")).toBe("tab here");
  });

  it("normalizes line endings and collapses horizontal whitespace", () => {
    expect(sanitizeText("line  one\r\nline   two\rline\tthree")).toBe(
      "line one\nline two\nline three",
    );
  });

  it("trims leading and trailing whitespace per line", () => {
    expect(sanitizeText("  hello  \n  world  ")).toBe("hello\nworld");
  });

  it("leaves HTML-looking text inert as plain strings", () => {
    const text = sanitizeText("<script>alert(1)</script>");
    expect(text).toBe("<script>alert(1)</script>");
  });
});

describe("parseVideoId", () => {
  it("extracts the video id from watch URLs", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(
      parseVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=61"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("extracts ids from shorts and youtu.be links", () => {
    expect(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for non-watch pages", () => {
    expect(parseVideoId("https://www.youtube.com/")).toBeNull();
    expect(parseVideoId("https://example.com/watch?v=abc")).toBeNull();
    expect(parseVideoId("not a url")).toBeNull();
  });
});

describe("canonicalWatchUrl", () => {
  it("builds a canonical watch URL from a video id", () => {
    expect(canonicalWatchUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });
});
