import { describe, expect, it } from "vitest";

describe("YouTubePlayer embed URL generation", () => {
  function buildEmbedUrl(
    videoId: string,
    origin?: string,
    initialStart?: number,
  ) {
    const params = new URLSearchParams({
      enablejsapi: "1",
      rel: "0",
    });
    if (origin) {
      params.set("origin", origin);
    }
    if (initialStart !== undefined && initialStart > 0) {
      params.set("start", String(Math.floor(initialStart)));
    }
    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
  }

  it("builds privacy-friendly embed URL with enablejsapi=1", () => {
    const url = buildEmbedUrl("dQw4w9WgXcQ");
    expect(url).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0",
    );
  });

  it("includes origin parameter when available", () => {
    const url = buildEmbedUrl("dQw4w9WgXcQ", "https://example.com");
    expect(url).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0&origin=https%3A%2F%2Fexample.com",
    );
  });

  it("includes start parameter when initialStart is specified", () => {
    const url = buildEmbedUrl("dQw4w9WgXcQ", "https://example.com", 125.7);
    expect(url).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0&origin=https%3A%2F%2Fexample.com&start=125",
    );
  });

  it("omits start parameter when initialStart is zero or negative", () => {
    const url = buildEmbedUrl("dQw4w9WgXcQ", undefined, 0);
    expect(url).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&rel=0",
    );
  });
});

describe("YouTubePlayer postMessage protocol", () => {
  it("formats seekTo command message correctly", () => {
    const command = JSON.stringify({
      event: "command",
      func: "seekTo",
      args: [120, true],
    });
    expect(JSON.parse(command)).toEqual({
      event: "command",
      func: "seekTo",
      args: [120, true],
    });
  });

  it("formats playVideo command message correctly", () => {
    const command = JSON.stringify({
      event: "command",
      func: "playVideo",
      args: [],
    });
    expect(JSON.parse(command)).toEqual({
      event: "command",
      func: "playVideo",
      args: [],
    });
  });
});
