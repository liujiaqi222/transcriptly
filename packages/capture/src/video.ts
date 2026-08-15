const WATCH_ID_PATTERN = /^[A-Za-z0-9_-]{6,}$/;

export function parseVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return id !== undefined && WATCH_ID_PATTERN.test(id) ? id : null;
  }

  if (parsed.pathname === "/watch") {
    const id = parsed.searchParams.get("v");
    return id && WATCH_ID_PATTERN.test(id) ? id : null;
  }

  const shorts = /^\/shorts\/([A-Za-z0-9_-]{6,})/.exec(parsed.pathname);
  if (shorts && shorts[1] !== undefined) return shorts[1];

  return null;
}

export function canonicalWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
