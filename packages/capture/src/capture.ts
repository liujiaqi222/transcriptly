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

/** YouTube channel URL path shapes accepted for a captured handle. */
const CHANNEL_HANDLE = /^\/(?:@[^/]+|channel\/[^/]+|user\/[^/]+|c\/[^/]+)\/?$/;
/** Hosts YouTube serves channel avatars from (#98). */
const CHANNEL_AVATAR_HOST =
  /^(?:[a-z0-9-]+\.)*(?:ggpht\.com|googleusercontent\.com|ytimg\.com)$/i;

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

/** An https avatar URL on a YouTube image host, or undefined if unusable. */
function normalizeChannelAvatarUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== "https:" ||
      !CHANNEL_AVATAR_HOST.test(url.hostname) ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

/** The channel URL path (`@handle` or `channel/UC…`), or "" if unusable. */
function normalizeChannelHandle(raw: string, base: string): string {
  if (raw.trim() === "") return "";

  try {
    const url = new URL(raw.trim(), base);
    const isYouTubeChannelPath = CHANNEL_HANDLE.test(url.pathname);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.youtube.com" ||
      !isYouTubeChannelPath ||
      url.search ||
      url.hash
    ) {
      return "";
    }
    return url.pathname.replace(/\/$/, "");
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

/** Channel identity read from ytInitialData: any field may be absent. */
interface InitialChannel {
  /** The owner renderer's title-run name, when present (full form). */
  titleRunName: string | null;
  /** The share-dialog item's name, when present (older variants). */
  dialogName: string | null;
  handle: string | null;
  avatarUrl?: string;
}

/**
 * Reads channel identity from the page's ytInitialData (#100). The owner
 * renderer's title runs are the primary source for name, handle, and
 * browseId across all observed page variants; the share dialog and page-wide
 * browseId lookup fill in when the owner uses another shape. An ID-form
 * handle is normalized to the `@handle` form so one channel cannot split
 * into two rows.
 */
function readInitialChannel(
  doc: Document,
  base: string,
): InitialChannel | null {
  const data = readYtInitialData(doc);
  if (!data) return null;
  const owner = findVideoOwnerRenderer(data);
  if (!owner) return null;

  const avatarUrl = readOwnerAvatarUrl(owner);
  const titleRunName = readOwnerName(owner);
  const dialogName = readOwnerDialogName(owner);
  const browseId = readOwnerBrowseId(owner);
  let handle = readOwnerHandle(owner, base);
  if (handle !== null) {
    handle = normalizeHandleByBrowseId(data, handle, browseId);
  }
  if (titleRunName === null && dialogName === null && handle === null) {
    return avatarUrl
      ? { titleRunName: null, dialogName: null, handle: null, avatarUrl }
      : null;
  }
  return {
    titleRunName,
    dialogName,
    handle,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

/** Reads the avatar the owner renderer carries, across its two shapes. */
function readOwnerAvatarUrl(
  owner: Record<string, unknown> | null,
): string | undefined {
  const thumbnail = asRecord(owner?.thumbnail);
  if (!thumbnail) return undefined;

  // Classic renderer: thumbnail.thumbnails[0].url.
  if (Array.isArray(thumbnail.thumbnails)) {
    const first = asRecord(thumbnail.thumbnails[0]);
    if (typeof first?.url === "string") {
      return normalizeChannelAvatarUrl(first.url);
    }
  }

  // Current view model: thumbnail.videoRendererThumbnailViewModel.image.sources[0].url.
  const image = asRecord(
    asRecord(thumbnail.videoRendererThumbnailViewModel)?.image,
  );
  if (Array.isArray(image?.sources)) {
    const first = asRecord(image.sources[0]);
    if (typeof first?.url === "string") {
      return normalizeChannelAvatarUrl(first.url);
    }
  }
  return undefined;
}

/**
 * Extracts the page's ytInitialData payload across the two script shapes
 * YouTube ships (#100): the classic `var ytInitialData = {…};` inline
 * script and the current `<script id="yt-initial-data" type="application/json">`
 * element. Returns the parsed object, or null when neither is present.
 */
function readYtInitialData(doc: Document): Record<string, unknown> | null {
  const scripts = Array.from(doc.scripts);

  // Current shape first: a JSON element whose textContent is the payload.
  const jsonElement = scripts.find((script) => script.id === "yt-initial-data");
  if (jsonElement?.textContent) {
    try {
      const parsed = asRecord(JSON.parse(jsonElement.textContent));
      if (parsed) return parsed;
    } catch {
      // Fall through to the inline script shape.
    }
  }

  for (const script of scripts) {
    const match = script.textContent?.match(
      /var ytInitialData\s*=\s*(\{[\s\S]*\})\s*;?\s*$/,
    );
    if (!match?.[1]) continue;
    try {
      const parsed = asRecord(JSON.parse(match[1]));
      if (parsed) return parsed;
    } catch {
      // Ignore malformed scripts and continue.
    }
  }
  return null;
}

/**
 * The handle path the owner's own endpoint gives: title runs carry the
 * channel's preferred `@handle` form in every observed variant, while the
 * dialog path may yield the raw `channel/UC…` form (#100).
 */
function readOwnerHandle(
  owner: Record<string, unknown> | null,
  base: string,
): string | null {
  const titleRuns = asRecord(owner?.title)?.runs;
  if (Array.isArray(titleRuns)) {
    const first = asRecord(titleRuns[0]);
    const endpoint = asRecord(
      asRecord(first?.navigationEndpoint)?.browseEndpoint,
    );
    if (typeof endpoint?.canonicalBaseUrl === "string") {
      const handle = normalizeChannelHandle(endpoint.canonicalBaseUrl, base);
      if (handle) return handle;
    }
  }

  // Dialog fallback: the share-sheet list item (older variants).
  const dialog = readOwnerDialogListItem(owner);
  if (dialog) {
    const endpoint = asRecord(
      asRecord(
        asRecord(asRecord(dialog.commandRuns[0])?.onTap)?.innertubeCommand,
      )?.browseEndpoint,
    );
    if (typeof endpoint?.canonicalBaseUrl === "string") {
      const handle = normalizeChannelHandle(endpoint.canonicalBaseUrl, base);
      if (handle) return handle;
    }
  }
  return null;
}

interface OwnerDialogListItem {
  name: string | null;
  commandRuns: unknown[];
}

/** The share-dialog list item (older variants), if the owner opens one. */
function readOwnerDialogListItem(
  owner: Record<string, unknown> | null,
): OwnerDialogListItem | null {
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
  if (!Array.isArray(listItems)) return null;
  for (const item of listItems) {
    const title = asRecord(asRecord(asRecord(item)?.listItemViewModel)?.title);
    const commandRuns = title?.commandRuns;
    if (!Array.isArray(commandRuns)) continue;
    const content = title?.content;
    return {
      name:
        typeof content === "string" && content.trim() !== ""
          ? sanitizeText(content)
          : null,
      commandRuns,
    };
  }
  return null;
}

/** The dialog list item's title, spelled out (older variants). */
function readOwnerDialogName(
  owner: Record<string, unknown> | null,
): string | null {
  const dialog = readOwnerDialogListItem(owner);
  return dialog === null ? null : dialog.name;
}

/** The channel name as the owner's title runs spell it. */
function readOwnerName(owner: Record<string, unknown> | null): string | null {
  const runs = asRecord(owner?.title)?.runs;
  if (!Array.isArray(runs)) return null;
  const text = asRecord(runs[0])?.text;
  return typeof text === "string" && text.trim() !== ""
    ? sanitizeText(text)
    : null;
}

/** The browseId (stable UC… identity) the owner endpoint carries, if any. */
function readOwnerBrowseId(
  owner: Record<string, unknown> | null,
): string | null {
  const titleRuns = asRecord(owner?.title)?.runs;
  if (Array.isArray(titleRuns)) {
    const endpoint = asRecord(
      asRecord(asRecord(titleRuns[0])?.navigationEndpoint)?.browseEndpoint,
    );
    const id = endpoint?.browseId;
    if (typeof id === "string" && id !== "") return id;
  }
  const dialog = readOwnerDialogListItem(owner);
  if (dialog) {
    const endpoint = asRecord(
      asRecord(
        asRecord(asRecord(dialog.commandRuns[0])?.onTap)?.innertubeCommand,
      )?.browseEndpoint,
    );
    const id = endpoint?.browseId;
    if (typeof id === "string" && id !== "") return id;
  }
  return null;
}

/**
 * Normalizes an ID-form handle to the page's `@handle` form for the same
 * browseId (#100): YouTube lists the channel elsewhere on the page (e.g. the
 * recommendations rail) with the `@handle` form, and both forms identify the
 * same channel, so keeping only the handle form prevents one channel from
 * splitting into two rows. Returns the original handle when the page never
 * names the channel in handle form.
 */
function normalizeHandleByBrowseId(
  data: Record<string, unknown>,
  handle: string,
  browseId: string | null,
): string {
  if (!handle.startsWith("/channel/")) return handle;
  // The ID form itself carries the browseId after `/channel/`.
  const id = browseId ?? handle.replace(/^\/channel\//, "");
  if (id === "") return handle;

  const handleForms = new Set<string>();
  collectHandleFormsByBrowseId(data, id, handleForms);
  for (const candidate of handleForms) {
    if (candidate.startsWith("/@")) return candidate;
  }
  return handle;
}

/**
 * Collects `@handle`-form canonicalBaseUrl values whose browseEndpoint
 * carries the given browseId anywhere in the page data.
 */
function collectHandleFormsByBrowseId(
  value: unknown,
  browseId: string,
  into: Set<string>,
): void {
  const record = asRecord(value);
  if (record) {
    const endpoint = asRecord(record.browseEndpoint);
    if (endpoint) {
      const baseUrl = endpoint.canonicalBaseUrl;
      const id = endpoint.browseId;
      if (
        typeof baseUrl === "string" &&
        typeof id === "string" &&
        id === browseId &&
        baseUrl.startsWith("/@")
      ) {
        into.add(baseUrl);
      }
    }
    for (const child of Object.values(record)) {
      collectHandleFormsByBrowseId(child, browseId, into);
    }
  } else if (Array.isArray(value)) {
    for (const child of value) {
      collectHandleFormsByBrowseId(child, browseId, into);
    }
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
  const initialChannel = readInitialChannel(doc, url);
  // Name priority: the owner's own title runs (full, from every current
  // variant), then the rendered DOM text (joint channels concatenate every
  // member there), then the share-dialog item (older variants) which carries
  // a shortened name. Dialog name must not mask the richer DOM text. An
  // empty name reaches the schema validator, which rejects it (#33).
  const domChannelName = readMeta(doc, selectors.meta.channelName);
  const channelName =
    initialChannel?.titleRunName ??
    (domChannelName !== "" ? domChannelName : null) ??
    initialChannel?.dialogName ??
    "";
  const rawChannelUrl =
    readFirstAttribute(doc, selectors.meta.channelUrl) ?? "";
  const channelHandle =
    initialChannel?.handle || normalizeChannelHandle(rawChannelUrl, url);
  // Prefer the avatar embedded in ytInitialData; fall back to the rendered
  // avatar image. Live-DOM sources may be placeholders (data URIs), which the
  // host check rejects.
  const channelAvatarUrl =
    initialChannel?.avatarUrl ??
    (selectors.meta.channelAvatar
      ? normalizeChannelAvatarUrl(
          readFirstAttribute(doc, selectors.meta.channelAvatar) ?? "",
        )
      : undefined);

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
    channelHandle,
    ...(channelAvatarUrl !== undefined ? { channelAvatarUrl } : {}),
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
  const seenSegments = new Set<string>();
  const seenChapters = new Set<string>();

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
    // Current YouTube layouts can split one transcript across sibling
    // #contents containers, so every outermost region must be read. In some
    // SPA states, however, two sibling regions contain the same rendered
    // transcript. Deduplicate only across regions by the canonical fields;
    // unique segments from genuinely split regions are still appended.
    const unseenSegments = segments.filter(
      (segment) =>
        !seenSegments.has(JSON.stringify([segment.start, segment.text])),
    );
    const unseenChapters = chapters.filter(
      (chapter) =>
        !seenChapters.has(JSON.stringify([chapter.start, chapter.title])),
    );

    for (const segment of segments) {
      seenSegments.add(JSON.stringify([segment.start, segment.text]));
    }
    for (const chapter of chapters) {
      seenChapters.add(JSON.stringify([chapter.start, chapter.title]));
    }
    allSegments.push(...unseenSegments);
    allChapters.push(...unseenChapters);
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let panelClicked = false;

  // The transcript section may not exist yet on a freshly loaded (or
  // background) tab, so keep waiting for it instead of failing fast: poll
  // for segments, click "Show transcript" as soon as the button appears,
  // and keep polling until the segments render.
  for (;;) {
    const body = readTranscriptBody(doc, selectors);
    if (body.segments.length > 0) return body;

    if (!panelClicked) {
      const section = doc.querySelector(selectors.transcript.section);
      const openButton = section?.querySelector<HTMLElement>(
        selectors.transcript.openButton,
      );
      if (openButton) {
        openButton.click();
        panelClicked = true;
      }
    }

    if (Date.now() >= deadline) return null;
    await sleep(pollIntervalMs);
  }
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
