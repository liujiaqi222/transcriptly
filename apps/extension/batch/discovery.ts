import type { BatchVideo } from "@/batch/jobs";
import { isBatchSourceUrl } from "@/entrypoints/popup/utils/youtube";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** "14:19", "1:02:03" - YouTube puts durations in `title` attributes. */
const DURATION_TEXT = /^\d{1,3}(:\d{2})+$/;

export { isBatchSourceUrl };

function parseVideoId(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl, "https://www.youtube.com");
    if (url.hostname !== "www.youtube.com" || url.pathname !== "/watch") return;
    const videoId = url.searchParams.get("v") ?? undefined;
    return videoId && VIDEO_ID.test(videoId) ? videoId : undefined;
  } catch {
    return undefined;
  }
}

function titleFor(anchor: HTMLAnchorElement): string {
  const card = anchor.closest(
    "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-video-renderer",
  );
  const cardTitle =
    card
      ?.querySelector("#video-title, #video-title-link")
      ?.textContent?.trim() ?? "";
  const anchorTitle = anchor.getAttribute("title")?.trim() ?? "";
  // Thumbnail links carry the duration, not the title, in some layouts.
  if (anchorTitle && !DURATION_TEXT.test(anchorTitle)) return anchorTitle;
  if (cardTitle && !DURATION_TEXT.test(cardTitle)) return cardTitle;
  return anchorTitle || cardTitle || anchor.textContent?.trim() || "";
}

export function discoverLoadedVideos(document: Document): BatchVideo[] {
  const videos: BatchVideo[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/watch?v="]',
  )) {
    const videoId = parseVideoId(
      anchor.href || anchor.getAttribute("href") || "",
    );
    const title = titleFor(anchor);
    if (!videoId || !title || seen.has(videoId)) continue;
    seen.add(videoId);
    videos.push({
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
    });
  }
  return videos;
}
