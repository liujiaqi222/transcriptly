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

function resolveUrl(raw: string, base: string): string {
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
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
  const channelName = readMeta(doc, selectors.meta.channelName);
  const rawChannelUrl =
    readFirstAttribute(doc, selectors.meta.channelUrl) ?? "";
  const channelUrl =
    rawChannelUrl.trim() === ""
      ? ""
      : resolveUrl(rawChannelUrl.trim(), doc.baseURI);

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

  for (const container of Array.from(
    doc.querySelectorAll(selectors.transcript.segmentsContainer),
  )) {
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
