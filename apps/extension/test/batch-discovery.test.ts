import { describe, expect, it } from "vitest";
import { discoverLoadedVideos, isBatchSourceUrl } from "../batch/discovery";

describe("batch discovery", () => {
  it("accepts playlist and channel videos pages only", () => {
    expect(
      isBatchSourceUrl("https://www.youtube.com/playlist?list=PL123"),
    ).toBe(true);
    expect(isBatchSourceUrl("https://www.youtube.com/@channel/videos")).toBe(
      true,
    );
    expect(isBatchSourceUrl("https://www.youtube.com/@channel")).toBe(true);
    expect(isBatchSourceUrl("https://www.youtube.com/channel/UC123")).toBe(
      true,
    );
    expect(
      isBatchSourceUrl("https://www.youtube.com/watch?v=abc12345678"),
    ).toBe(false);
    expect(isBatchSourceUrl("https://m.youtube.com/playlist?list=PL123")).toBe(
      false,
    );
  });

  it("discovers unique videos already rendered in the document", () => {
    document.body.innerHTML = `
      <ytd-grid-video-renderer>
        <a id="video-title" href="https://www.youtube.com/watch?v=abc12345678" title="First title">First title</a>
      </ytd-grid-video-renderer>
      <ytd-grid-video-renderer>
        <a id="video-title" href="https://www.youtube.com/watch?v=def12345678">Second title</a>
      </ytd-grid-video-renderer>
      <a href="https://www.youtube.com/watch?v=abc12345678">Duplicate</a>
      <a href="https://www.youtube.com/watch?v=not-an-id">Invalid</a>
    `;

    expect(discoverLoadedVideos(document)).toEqual([
      {
        videoId: "abc12345678",
        url: "https://www.youtube.com/watch?v=abc12345678",
        title: "First title",
      },
      {
        videoId: "def12345678",
        url: "https://www.youtube.com/watch?v=def12345678",
        title: "Second title",
      },
    ]);
  });

  it("never promotes a duration to a title (#59)", () => {
    // Newer card layouts: the title anchor has no #video-title id and
    // the duration overlay sits inside the thumbnail anchor's own text.
    document.body.innerHTML = `
      <ytd-rich-item-renderer>
        <a id="thumbnail" href="https://www.youtube.com/watch?v=abc12345678" title="14:19">14:19</a>
        <h3><a href="https://www.youtube.com/watch?v=abc12345678">Real title</a></h3>
      </ytd-rich-item-renderer>
      <ytd-rich-item-renderer>
        <a id="thumbnail" href="https://www.youtube.com/watch?v=def12345678">3:41</a>
      </ytd-rich-item-renderer>
    `;

    const videos = discoverLoadedVideos(document);
    // The h3 fallback supplies the real title; a card with only a
    // duration to offer yields no title and is not discovered.
    expect(videos).toEqual([
      {
        videoId: "abc12345678",
        url: "https://www.youtube.com/watch?v=abc12345678",
        title: "Real title",
      },
    ]);
  });

  it("falls back to the thumbnail aria-label without its duration suffix", () => {
    document.body.innerHTML = `
      <ytd-rich-item-renderer>
        <a
          id="thumbnail"
          href="https://www.youtube.com/watch?v=abc12345678"
          aria-label="Fallback title by Ship It Weekly 14:19"
        ></a>
      </ytd-rich-item-renderer>
    `;

    expect(discoverLoadedVideos(document)).toEqual([
      {
        videoId: "abc12345678",
        url: "https://www.youtube.com/watch?v=abc12345678",
        title: "Fallback title by Ship It Weekly",
      },
    ]);
  });
});
