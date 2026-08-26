import type { BatchVideo } from "@/batch/jobs";
import { isBatchSourceUrl } from "@/entrypoints/popup/utils/youtube";

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** "14:19", "1:02:03" - YouTube puts durations in `title` attributes. */
const DURATION_TEXT = /^\d{1,3}(:\d{2})+$/;
/** The duration suffix of an accessible thumbnail label: "… by Channel 14:19". */
const TRAILING_DURATION = /\s+\d{1,3}(:\d{2})+$/;
const VIDEO_CARD_SELECTOR = "yt-lockup-view-model";
const VIDEO_CARD_LINK_SELECTOR = `${VIDEO_CARD_SELECTOR} a[href*="/watch?v="]`;

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

/** Text that may serve as a title; durations never qualify. */
function cleanTitle(text: string | null | undefined): string {
  const value = text?.trim() ?? "";
  return value && !DURATION_TEXT.test(value) ? value : "";
}

export function findLoadedVideoCard(anchor: HTMLAnchorElement): Element {
  return anchor.closest(VIDEO_CARD_SELECTOR) ?? anchor;
}

function titleFor(anchor: HTMLAnchorElement): string {
  const card = findLoadedVideoCard(anchor);
  // Title candidates, best first. Durations are filtered from every
  // candidate: thumbnail links carry "14:19" in `title`, and in newer
  // card layouts the duration overlay even sits inside the anchor's
  // own text - none of that may ever become a video's title (#59).
  const candidates = [
    cleanTitle(anchor.getAttribute("title")),
    cleanTitle(
      card?.querySelector("#video-title, #video-title-link, h3 a")?.textContent,
    ),
    cleanTitle(card?.querySelector("h3")?.textContent),
    // Thumbnail aria-label: "Title by Channel 14:19" - strip the suffix.
    cleanTitle(
      anchor.getAttribute("aria-label")?.replace(TRAILING_DURATION, ""),
    ),
    cleanTitle(anchor.textContent),
  ];
  return candidates.find((candidate) => candidate.length > 0) ?? "";
}

/** Finds the source-feed anchor for one video, never a persistent player link. */
export function findLoadedVideoAnchor(
  document: Document,
  videoId: string,
): HTMLAnchorElement | undefined {
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    VIDEO_CARD_LINK_SELECTOR,
  )) {
    if (
      parseVideoId(anchor.href || anchor.getAttribute("href") || "") === videoId
    ) {
      return anchor;
    }
  }
  return undefined;
}

export function discoverLoadedVideos(document: Document): BatchVideo[] {
  const videos: BatchVideo[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    VIDEO_CARD_LINK_SELECTOR,
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
