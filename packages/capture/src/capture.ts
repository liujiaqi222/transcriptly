import type {
  Capture,
  CaptureChapter,
  CaptureSegment,
} from "@transcriptly/schema";
import { CaptureError, type CaptureFailure, toCaptureFailure } from "./errors";
import { sanitizeText } from "./sanitize";
import {
  type SelectorRule,
  type SiteSelectors,
  youtubeSelectors,
} from "./selectors";
import { parseDuration, parseTimestamp } from "./timestamp";
import { canonicalWatchUrl, parseVideoId } from "./video";

export interface CaptureOptions {
  selectors?: SiteSelectors;
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => Date;
}

export interface CaptureOutcome {
  ok: true;
  capture: Capture;
}

export interface CaptureFailureOutcome extends CaptureFailure {
  ok: false;
}

export type CaptureResult = CaptureOutcome | CaptureFailureOutcome;

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readAttribute(doc: Document, rule: SelectorRule): string | null {
  const element = doc.querySelector(rule.selector);
  if (!element) return null;

  if (rule.attribute) {
    return element.getAttribute(rule.attribute);
  }
  return element.textContent;
}

function readFirstAttribute(
  doc: Document,
  rules: SelectorRule[],
): string | null {
  for (const rule of rules) {
    const value = readAttribute(doc, rule);
    if (value !== null && value.trim() !== "") return value;
  }
  return null;
}

function readMeta(doc: Document, rules: SelectorRule[]): string {
  return sanitizeText(readFirstAttribute(doc, rules) ?? "");
}

function normalizeChannelUrl(raw: string, base: string): string {
  if (raw.trim() === "") return "";

  try {
    const url = new URL(raw.trim(), base);
    const isYouTubeChannelPath =
      /^\/(?:@[^/]+|channel\/[^/]+|user\/[^/]+|c\/[^/]+)\/?$/.test(
        url.pathname,
      );
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.youtube.com" ||
      !isYouTubeChannelPath ||
      url.search ||
      url.hash
    ) {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function findVideoOwnerRenderer(
  value: unknown,
): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  const owner = asRecord(record.videoOwnerRenderer);
  if (owner) return owner;

  for (const child of Object.values(record)) {
    const found = findVideoOwnerRenderer(child);
    if (found) return found;
  }
  return null;
}

interface InitialChannel {
  name: string;
  url: string;
}

function readInitialChannel(
  doc: Document,
  base: string,
): InitialChannel | null {
  for (const script of Array.from(doc.scripts)) {
    const match = script.textContent?.match(
      /var ytInitialData\s*=\s*(\{[\s\S]*\})\s*;?\s*$/,
    );
    if (!match?.[1]) continue;

    try {
      const owner = findVideoOwnerRenderer(JSON.parse(match[1]));
      const listItems = asRecord(
        asRecord(
          asRecord(
            asRecord(
              asRecord(
                asRecord(asRecord(owner?.navigationEndpoint)?.showDialogCommand)
                  ?.panelLoadingStrategy,
              )?.inlineContent,
            )?.dialogViewModel,
          )?.customContent,
        )?.listViewModel,
      )?.listItems;
      if (!Array.isArray(listItems)) continue;

      for (const item of listItems) {
        const itemRecord = asRecord(item);
        const viewModel = asRecord(itemRecord?.listItemViewModel);
        const title = asRecord(viewModel?.title);
        const commandRuns = title?.commandRuns;
        if (!Array.isArray(commandRuns)) continue;
        const firstRun = asRecord(commandRuns[0]);
        const endpoint = asRecord(
          asRecord(asRecord(firstRun?.onTap)?.innertubeCommand)?.browseEndpoint,
        );
        const canonicalBaseUrl = endpoint?.canonicalBaseUrl;
        const name = title?.content;
        if (typeof canonicalBaseUrl === "string" && typeof name === "string") {
          const url = normalizeChannelUrl(canonicalBaseUrl, base);
          if (url && name.trim() !== "") {
            return { name: sanitizeText(name), url };
          }
        }
      }
    } catch {
      // Ignore malformed or unrelated scripts and continue with DOM metadata.
    }
  }
  return null;
}

function normalizePublishedAt(raw: string): string | undefined {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const displayDate =
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/.exec(
      raw,
    );
  const values = dateOnly
    ? {
        year: Number(dateOnly[1]),
        month: Number(dateOnly[2]) - 1,
        day: Number(dateOnly[3]),
      }
    : displayDate
      ? {
          year: Number(displayDate[3]),
          month: [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ].indexOf(displayDate[1] ?? ""),
          day: Number(displayDate[2]),
        }
      : undefined;
  if (!values || values.month < 0) return undefined;

  const normalized = new Date(Date.UTC(values.year, values.month, values.day));
  if (
    normalized.getUTCFullYear() !== values.year ||
    normalized.getUTCMonth() !== values.month ||
    normalized.getUTCDate() !== values.day
  ) {
    return undefined;
  }
  return normalized.toISOString();
}

function readSource(
  doc: Document,
  selectors: SiteSelectors,
  url: string,
  videoId: string,
): Capture["source"] {
  const title = readMeta(doc, selectors.meta.title);
  const description = readMeta(doc, selectors.meta.description);
  const initialChannel = readInitialChannel(doc, url);
  const channelName =
    initialChannel?.name ?? readMeta(doc, selectors.meta.channelName);
  const rawChannelUrl =
    readFirstAttribute(doc, selectors.meta.channelUrl) ?? "";
  const channelUrl =
    initialChannel?.url || normalizeChannelUrl(rawChannelUrl, url);

  const publishedAt = selectors.meta.publishedAt
    ? normalizePublishedAt(readMeta(doc, selectors.meta.publishedAt))
    : undefined;

  let durationSeconds: number | undefined;
  if (selectors.meta.duration) {
    const rawDuration = readFirstAttribute(doc, selectors.meta.duration);
    if (rawDuration !== null) {
      const parsed = parseDuration(rawDuration) ?? parseTimestamp(rawDuration);
      if (parsed !== null) durationSeconds = parsed;
    }
  }

  return {
    videoId,
    url,
    title,
    channelName,
    channelUrl,
    description,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  };
}

interface TranscriptBody {
  segments: CaptureSegment[];
  chapters: CaptureChapter[];
}

function readTranscriptBody(
  doc: Document,
  selectors: SiteSelectors,
): TranscriptBody {
  const allSegments: CaptureSegment[] = [];
  const allChapters: CaptureChapter[] = [];

  // The selector list intentionally over-matches (classic DOM, engagement
  // panel, bare container) to survive YouTube variants. When the panel is
  // expanded, an outer match (the panel's #contents) nests an inner one
  // (#segments-container), and iterating both would emit every segment
  // twice. querySelectorAll returns document order - ancestors first - so
  // skipping any container nested inside an earlier match keeps only the
  // outermost container of each region.
  const matched = Array.from(
    doc.querySelectorAll(selectors.transcript.segmentsContainer),
  );
  const containers = matched.filter(
    (container, index) =>
      !matched.slice(0, index).some((earlier) => earlier.contains(container)),
  );

  for (const container of containers) {
    const nodes = Array.from(
      container.querySelectorAll(
        `${selectors.transcript.chapter}, ${selectors.transcript.segment}`,
      ),
    );
    const segments: CaptureSegment[] = [];
    const chapters: CaptureChapter[] = [];
    let currentChapter: string | null = null;

    for (const node of nodes) {
      if (node.matches(selectors.transcript.chapter)) {
        const title = sanitizeText(
          node.querySelector(selectors.transcript.chapterText)?.textContent ??
            "",
        );
        currentChapter = title.length > 0 ? title : null;
        continue;
      }

      if (node.matches(selectors.transcript.segment)) {
        const timestampElement = node.querySelector(
          selectors.transcript.segmentTimestamp,
        );
        const textElement = node.querySelector(
          selectors.transcript.segmentText,
        );

        const rawTimestamp = timestampElement?.textContent ?? null;
        const start = parseTimestamp(rawTimestamp);
        if (start === null) {
          throw new CaptureError(
            "malformed-segments",
            `Unparseable segment timestamp: ${JSON.stringify(rawTimestamp ?? null)}`,
          );
        }

        const text = sanitizeText(textElement?.textContent ?? "");
        if (text.length === 0) {
          throw new CaptureError(
            "malformed-segments",
            "Segment has empty text",
          );
        }

        if (currentChapter !== null) {
          const last = chapters[chapters.length - 1];
          if (last === undefined || last.title !== currentChapter) {
            chapters.push({ start, title: currentChapter });
          }
        }
        segments.push({ start, text });
      }
    }
    allSegments.push(...segments);
    allChapters.push(...chapters);
  }

  return { segments: allSegments, chapters: allChapters };
}

function readChaptersFromMarkers(
  doc: Document,
  selectors: SiteSelectors,
): CaptureChapter[] {
  if (!selectors.chapters) return [];
  const panel = doc.querySelector(selectors.chapters.panel);
  if (!panel) return [];

  const chapters: CaptureChapter[] = [];
  for (const node of Array.from(
    panel.querySelectorAll(selectors.chapters.item),
  )) {
    const title = sanitizeText(
      node.querySelector(selectors.chapters.itemTitle)?.textContent ?? "",
    );
    const start = parseTimestamp(
      node.querySelector(selectors.chapters.itemTime)?.textContent ?? null,
    );
    if (title.length === 0 || start === null) continue;
    chapters.push({ start, title });
  }
  return chapters;
}

async function readTranscriptFromDom(
  doc: Document,
  selectors: SiteSelectors,
  options: CaptureOptions,
): Promise<TranscriptBody | null> {
  let body = readTranscriptBody(doc, selectors);
  if (body.segments.length > 0) return body;

  const section = doc.querySelector(selectors.transcript.section);
  if (!section) return null;

  const openButton = section.querySelector<HTMLElement>(
    selectors.transcript.openButton,
  );
  if (!openButton) {
    return null;
  }

  openButton.click();
  body = readTranscriptBody(doc, selectors);
  if (body.segments.length > 0) return body;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    body = readTranscriptBody(doc, selectors);
    if (body.segments.length > 0) return body;
  }

  return null;
}

export async function capture(
  doc: Document,
  pageUrl: string,
  options: CaptureOptions = {},
): Promise<Capture> {
  const selectors = options.selectors ?? youtubeSelectors;
  const now = options.now ?? (() => new Date());

  const videoId = parseVideoId(pageUrl);
  if (!videoId) {
    throw new CaptureError(
      "not-a-watch-page",
      `URL is not a YouTube watch page: ${pageUrl}`,
    );
  }

  const url = canonicalWatchUrl(videoId);
  const source = readSource(doc, selectors, url, videoId);
  const transcript = await readTranscriptFromDom(doc, selectors, options);
  if (!transcript) {
    throw new CaptureError("no-transcript", "No usable transcript was found");
  }
  const { segments, chapters: transcriptChapters } = transcript;
  const chapters =
    transcriptChapters.length > 0
      ? transcriptChapters
      : readChaptersFromMarkers(doc, selectors);

  return {
    source,
    capturedAt: now().toISOString(),
    segments,
    ...(chapters.length > 0 ? { chapters } : {}),
  };
}

export async function captureOutcome(
  doc: Document,
  pageUrl: string,
  options: CaptureOptions = {},
): Promise<CaptureResult> {
  try {
    const result = await capture(doc, pageUrl, options);
    return { ok: true, capture: result };
  } catch (error) {
    const failure = toCaptureFailure(error);
    return { ok: false, kind: failure.kind, message: failure.message };
  }
}
