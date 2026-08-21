import { canonicalWatchUrl, parseVideoId } from "@transcriptly/capture";

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "m.youtube.com"]);

export function isYouTubeWatchUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    if (!YOUTUBE_HOSTS.has(new URL(url).hostname)) return false;
  } catch {
    return false;
  }
  return parseVideoId(url) !== null;
}

export function segmentUrl(videoId: string, start: number): string {
  return `${canonicalWatchUrl(videoId)}&t=${start}s`;
}
