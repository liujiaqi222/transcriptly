import type { Capture, CaptureChapter, CaptureSegment } from "@transcriptly/schema";
import { CaptureError, toCaptureFailure, type CaptureFailure } from "./errors";
import { sanitizeText } from "./sanitize";
import { type SelectorRule, type SiteSelectors, youtubeSelectors } from "./selectors";
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

function readAttribute(
  doc: Document,
  rule: { selector: string; attribute?: string },
): string | null {
  const element = doc.querySelector(rule.selector);
  if (!element) return null;

  if (rule.attribute) {
    return element.getAttribute(rule.attribute);
  }
  return element.textContent;
}

function readMeta(doc: Document, rule: SelectorRule): string {
  return sanitizeText(readAttribute(doc, rule) ?? "");
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
  const channelUrl = (readAttribute(doc, selectors.meta.channelUrl) ?? "").trim();

  const publishedAt = selectors.meta.publishedAt
    ? readMeta(doc, selectors.meta.publishedAt) || undefined
    : undefined;

  const language = selectors.meta.language
    ? readMeta(doc, selectors.meta.language) || undefined
    : undefined;

  let durationSeconds: number | undefined;
  if (selectors.meta.duration) {
    const rawDuration = readAttribute(doc, selectors.meta.duration);
    const parsed = parseDuration(rawDuration);
    if (parsed !== null) durationSeconds = parsed;
  }

  return {
    videoId,
    url,
    title,
    channelName,
    channelUrl,
    description,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    ...(language !== undefined ? { language } : {}),
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
  const container = doc.querySelector(selectors.transcript.segmentsContainer);
  const nodes = container ? Array.from(container.children) : [];

  const segments: CaptureSegment[] = [];
  const chapters: CaptureChapter[] = [];
  let currentChapter: string | null = null;

  for (const node of nodes) {
    if (node.matches(selectors.transcript.chapter)) {
      const title = sanitizeText(
        node.querySelector(selectors.transcript.chapterText)?.textContent ?? "",
      );
      currentChapter = title.length > 0 ? title : null;
      continue;
    }

    if (node.matches(selectors.transcript.segment)) {
      const timestampElement = node.querySelector(
        selectors.transcript.segmentTimestamp,
      );
      const textElement = node.querySelector(selectors.transcript.segmentText);

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
        throw new CaptureError("malformed-segments", "Segment has empty text");
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

  return { segments, chapters };
}

async function readTranscript(
  doc: Document,
  selectors: SiteSelectors,
  options: CaptureOptions,
): Promise<TranscriptBody> {
  const section = doc.querySelector(selectors.transcript.section);
  if (!section) {
    throw new CaptureError("no-transcript", "Transcript section not found");
  }

  let body = readTranscriptBody(doc, selectors);
  if (body.segments.length > 0) return body;

  const openButton = section.querySelector<HTMLElement>(
    selectors.transcript.openButton,
  );
  if (!openButton) {
    throw new CaptureError(
      "no-transcript",
      "No transcript open control on the page",
    );
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

  throw new CaptureError(
    "no-transcript",
    "Transcript segments did not render after opening the panel",
  );
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
  const { segments, chapters } = await readTranscript(doc, selectors, options);

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
