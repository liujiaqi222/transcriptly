import { describe, expect, it } from "vitest";
import {
  discoverLoadedVideos,
  isBatchSourceUrl,
} from "../batch/selection/discovery";

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
      <yt-lockup-view-model>
        <a id="video-title" href="https://www.youtube.com/watch?v=abc12345678" title="First title">First title</a>
      </yt-lockup-view-model>
      <yt-lockup-view-model>
        <a id="video-title" href="https://www.youtube.com/watch?v=def12345678">Second title</a>
      </yt-lockup-view-model>
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

  it("discovers videos from YouTube's current lockup cards", () => {
    document.body.innerHTML = `
      <yt-lockup-view-model>
        <a href="/watch?v=abc12345678&list=PL123&index=1">20:30</a>
        <h3>
          <a
            href="/watch?v=abc12345678&list=PL123&index=1"
            aria-label="Current playlist title 20 minutes"
          >Current playlist title</a>
        </h3>
      </yt-lockup-view-model>
    `;

    expect(discoverLoadedVideos(document)).toEqual([
      {
        videoId: "abc12345678",
        url: "https://www.youtube.com/watch?v=abc12345678",
        title: "Current playlist title",
      },
    ]);
  });

  it("ignores persistent player recommendations outside the source feed", () => {
    document.body.innerHTML = `
      <div class="html5-video-player">
        <a class="ytp-next-button" href="https://www.youtube.com/watch?v=bad12345678" title="Next (SHIFT+n)"></a>
        <a class="ytp-modern-videowall-still" href="https://www.youtube.com/watch?v=bad87654321">Another creator's video</a>
      </div>
      <yt-lockup-view-model>
        <a href="https://www.youtube.com/watch?v=abc12345678" title="Bailey video"><span id="video-title">Bailey video</span></a>
      </yt-lockup-view-model>
    `;

    expect(discoverLoadedVideos(document)).toEqual([
      {
        videoId: "abc12345678",
        url: "https://www.youtube.com/watch?v=abc12345678",
        title: "Bailey video",
      },
    ]);
  });

  it("never promotes a duration to a title (#59)", () => {
    // Newer card layouts: the title anchor has no #video-title id and
    // the duration overlay sits inside the thumbnail anchor's own text.
    document.body.innerHTML = `
      <yt-lockup-view-model>
        <a id="thumbnail" href="https://www.youtube.com/watch?v=abc12345678" title="14:19">14:19</a>
        <h3><a href="https://www.youtube.com/watch?v=abc12345678">Real title</a></h3>
      </yt-lockup-view-model>
      <yt-lockup-view-model>
        <a id="thumbnail" href="https://www.youtube.com/watch?v=def12345678">3:41</a>
      </yt-lockup-view-model>
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
      <yt-lockup-view-model>
        <a
          id="thumbnail"
          href="https://www.youtube.com/watch?v=abc12345678"
          aria-label="Fallback title by Ship It Weekly 14:19"
        ></a>
      </yt-lockup-view-model>
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
