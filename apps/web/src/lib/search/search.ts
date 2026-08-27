import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { canonicalVideos, publicPublications, segments } from "../../db/schema";

/** Upper bound on matched segments returned for one query (#39). */
export const SEARCH_HIT_LIMIT = 50;

/** Upper bound on the accepted query string, kept short to bound FTS work. */
export const MAX_SEARCH_QUERY_LENGTH = 200;

/**
 * Number of neighbouring segments shown on each side of a hit. A window of
 * three segments (hit + one on each side) is enough source context to judge a
 * match without replaying the whole transcript.
 */
export const SEARCH_CONTEXT_RADIUS = 1;

export type SearchWindowSegment = {
  position: number;
  start: number;
  text: string;
  /** True for the segment that matched the query. */
  isHit: boolean;
};

export type SearchHit = {
  /** Stable identity for React keys: `videoId:segmentPosition`. */
  key: string;
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  /** Whole-second timestamp of the hit segment for the YouTube deep link. */
  hitStart: number;
  /** The hit segment plus up to one neighbour on each side, ordered. */
  window: SearchWindowSegment[];
};

export type SearchResult = {
  hits: SearchHit[];
};

/**
 * Normalizes a raw query for search: trims whitespace and returns `null` for
 * an empty query so callers can short-circuit to an explicit empty state
 * without touching the database (#39).
 */
export function normalizeQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > MAX_SEARCH_QUERY_LENGTH
    ? trimmed.slice(0, MAX_SEARCH_QUERY_LENGTH)
    : trimmed;
}

/**
 * Escapes PostgreSQL LIKE/ILIKE metacharacters (`%`, `_`, `\`) so the query is
 * treated as a literal substring. ILIKE's default escape character is `\`.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** CJK queries need literal substring matching because simple FTS has no word segmentation. */
function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

/** A single Latin token can safely use PostgreSQL FTS prefix matching for names. */
function isLatinToken(value: string): boolean {
  return /^[A-Za-z0-9]+$/u.test(value);
}

type HitRow = {
  transcriptId: string;
  position: number;
  start: number;
  text: string;
  videoId: string;
  url: string;
  title: string;
  channelName: string;
};

type ContextRow = {
  transcriptId: string;
  position: number;
  start: number;
  text: string;
};

/**
 * Exact public search over active Publications only. Contributions, private
 * Library Items, inactive publications, and non-current Transcript versions
 * never enter this query.
 */
export async function searchPublicArchive(
  db: Database,
  rawQuery: string,
): Promise<SearchResult> {
  const query = normalizeQuery(rawQuery);
  if (query === null) return { hits: [] };

  const rank = sql<number>`ts_rank(${segments.searchVector}, websearch_to_tsquery('simple', ${query}))`;
  const exactPredicate = sql`${segments.searchVector} @@ websearch_to_tsquery('simple', ${query})`;
  const searchPredicate = containsCjk(query)
    ? ilike(segments.text, `%${escapeLike(query)}%`)
    : isLatinToken(query)
      ? or(
          exactPredicate,
          sql`${segments.searchVector} @@ to_tsquery('simple', ${query} || ':*')`,
        )
      : exactPredicate;

  const hits = await db
    .select({
      transcriptId: segments.transcriptId,
      position: segments.position,
      start: segments.startSeconds,
      text: segments.text,
      videoId: canonicalVideos.youtubeVideoId,
      url: canonicalVideos.sourceUrl,
      title: canonicalVideos.title,
      channelName: canonicalVideos.channelName,
    })
    .from(segments)
    .innerJoin(
      publicPublications,
      eq(publicPublications.currentTranscriptId, segments.transcriptId),
    )
    .innerJoin(
      canonicalVideos,
      eq(canonicalVideos.id, publicPublications.videoId),
    )
    .where(and(eq(publicPublications.active, true), searchPredicate))
    .orderBy(
      desc(rank),
      desc(publicPublications.publishedAt),
      asc(canonicalVideos.youtubeVideoId),
      asc(segments.position),
    )
    .limit(SEARCH_HIT_LIMIT);

  if (hits.length === 0) return { hits: [] };
  const windows = await fetchContextWindows(db, hits);
  return {
    hits: hits.map((hit) => ({
      key: `${hit.videoId}:${hit.position}`,
      videoId: hit.videoId,
      url: hit.url,
      title: hit.title,
      channelName: hit.channelName,
      hitStart: hit.start,
      window: buildWindow(hit, windows),
    })),
  };
}

/**
 * Fetches the context segments for every hit transcript in one bounded query,
 * keyed by transcript id then position. Each transcript window spans the
 * union of its hits' `[position - radius, position + radius]` ranges, so the
 * per-hit window can be reconstructed locally.
 */
async function fetchContextWindows(
  db: Database,
  hits: readonly HitRow[],
): Promise<Map<string, Map<number, { start: number; text: string }>>> {
  const ranges = new Map<string, { min: number; max: number }>();
  for (const hit of hits) {
    const range = ranges.get(hit.transcriptId);
    if (!range) {
      ranges.set(hit.transcriptId, { min: hit.position, max: hit.position });
    } else {
      range.min = Math.min(range.min, hit.position);
      range.max = Math.max(range.max, hit.position);
    }
  }

  const rows: ContextRow[] = await db
    .select({
      transcriptId: segments.transcriptId,
      position: segments.position,
      start: segments.startSeconds,
      text: segments.text,
    })
    .from(segments)
    .where(
      or(
        ...[...ranges].map(([transcriptId, { min, max }]) =>
          and(
            eq(segments.transcriptId, transcriptId),
            gte(segments.position, min - SEARCH_CONTEXT_RADIUS),
            lte(segments.position, max + SEARCH_CONTEXT_RADIUS),
          ),
        ),
      ),
    )
    .orderBy(asc(segments.position));

  const windows = new Map<
    string,
    Map<number, { start: number; text: string }>
  >();
  for (const row of rows) {
    let byPosition = windows.get(row.transcriptId);
    if (!byPosition) {
      byPosition = new Map();
      windows.set(row.transcriptId, byPosition);
    }
    byPosition.set(row.position, { start: row.start, text: row.text });
  }
  return windows;
}

function buildWindow(
  hit: HitRow,
  windows: Map<string, Map<number, { start: number; text: string }>>,
): SearchWindowSegment[] {
  const byPosition = windows.get(hit.transcriptId);
  const window: SearchWindowSegment[] = [];
  for (
    let position = hit.position - SEARCH_CONTEXT_RADIUS;
    position <= hit.position + SEARCH_CONTEXT_RADIUS;
    position += 1
  ) {
    const segment = byPosition?.get(position);
    if (!segment) continue;
    window.push({
      position,
      start: segment.start,
      text: segment.text,
      isHit: position === hit.position,
    });
  }
  return window;
}
