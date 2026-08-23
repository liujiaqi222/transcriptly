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
});
