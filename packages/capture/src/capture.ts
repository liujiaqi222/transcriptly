import type { Capture, CaptureSegment } from "@transcriptly/schema";
import { CaptureError, toCaptureFailure } from "./errors";
import { sanitizeText } from "./sanitize";
import { type SiteSelectors, youtubeSelectors } from "./selectors";
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

export interface CaptureFailureOutcome {
  ok: false;
  kind: CaptureError["kind"];
  message: string;
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

function readSource(
  doc: Document,
  selectors: SiteSelectors,
  url: string,
  videoId: string,
): Capture["source"] {
  const title = sanitizeText(readAttribute(doc, selectors.meta.title) ?? "");
  const description = sanitizeText(
    readAttribute(doc, selectors.meta.description) ?? "",
  );
  const channelName = sanitizeText(
    readAttribute(doc, selectors.meta.channelName) ?? "",
  );
  const channelUrl = (readAttribute(doc, selectors.meta.channelUrl) ?? "").trim();

  const publishedAt = selectors.meta.publishedAt
    ? sanitizeText(readAttribute(doc, selectors.meta.publishedAt) ?? "") || undefined
    : undefined;

  const language = selectors.meta.language
    ? sanitizeText(readAttribute(doc, selectors.meta.language) ?? "") || undefined
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

function readSegments(doc: Document, selectors: SiteSelectors): CaptureSegment[] {
  const container = doc.querySelector(selectors.transcript.segmentsContainer);
  const segmentNodes = container
    ? Array.from(container.querySelectorAll(selectors.transcript.segment))
    : [];

  return segmentNodes.map((node) => {
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

    return { start, text };
  });
}

async function readTranscript(
  doc: Document,
  selectors: SiteSelectors,
  options: CaptureOptions,
): Promise<CaptureSegment[]> {
  const section = doc.querySelector(selectors.transcript.section);
  if (!section) {
    throw new CaptureError("no-transcript", "Transcript section not found");
  }

  let segments = readSegments(doc, selectors);
  if (segments.length > 0) return segments;

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
  segments = readSegments(doc, selectors);
  if (segments.length > 0) return segments;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    segments = readSegments(doc, selectors);
    if (segments.length > 0) return segments;
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
  const segments = await readTranscript(doc, selectors, options);

  return {
    source,
    capturedAt: now().toISOString(),
    segments,
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
