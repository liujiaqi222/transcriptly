import { canonicalWatchUrl, parseVideoId } from "@transcriptly/capture";

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "m.youtube.com"]);
const BATCH_CHANNEL_PATH =
  /^\/(?:@[^/]+|channel\/[^/]+|user\/[^/]+|c\/[^/]+)(?:\/videos)?\/?$/;
const CHANNEL_ROOT_PATH =
  /^\/(?:@[^/]+|channel\/[^/]+|user\/[^/]+|c\/[^/]+)\/?$/;

export function isBatchSourceUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "www.youtube.com" &&
      (parsed.pathname === "/playlist" ||
        BATCH_CHANNEL_PATH.test(parsed.pathname))
    );
  } catch {
    return false;
  }
}

/** A channel root page (no /videos tab): a batch entry that only guides. */
export function isChannelRootUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "www.youtube.com" &&
      CHANNEL_ROOT_PATH.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/** Turn a supported channel root URL into its batch-selectable Videos tab. */
export function channelVideosUrl(url: string): string | undefined {
  if (!isChannelRootUrl(url)) return undefined;
  const parsed = new URL(url);
  parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/videos`;
  return parsed.toString();
}

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
