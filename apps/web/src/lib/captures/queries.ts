import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  canonicalVideos,
  chapters,
  libraryItems,
  segments,
} from "../../db/schema";

/** Items per page on the private saved list (#37). */
export const SAVED_PAGE_SIZE = 20;

export type SavedItemSummary = {
  videoId: string;
  title: string;
  channelName: string;
  capturedAt: Date;
  segmentCount: number;
};

export type SavedItemPage = {
  items: SavedItemSummary[];
  total: number;
  page: number;
  pageCount: number;
};

export type SavedItemDetail = {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  channelUrl: string;
  description: string;
  publishedAt: Date | null;
  durationSeconds: number | null;
  capturedAt: Date;
  segments: { start: number; text: string }[];
  chapters: { start: number; title: string }[];
};

const segmentCount = sql<number>`(
  select count(*)::int as segment_count
  from ${segments}
  where ${segments.transcriptId} = ${libraryItems.transcriptId}
)`;

/**
 * One page of the current user's private Library Items, newest capture
 * first. Authorization is built in: rows are always scoped to `userId`.
 */
export async function listSavedItems(
  db: Database,
  userId: string,
  page: number,
): Promise<SavedItemPage> {
  const [counted] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(libraryItems)
    .where(eq(libraryItems.userId, userId));
  const total = counted?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / SAVED_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const items = await db
    .select({
      videoId: canonicalVideos.youtubeVideoId,
      title: canonicalVideos.title,
      channelName: canonicalVideos.channelName,
      capturedAt: libraryItems.capturedAt,
      segmentCount,
    })
    .from(libraryItems)
    .innerJoin(canonicalVideos, eq(canonicalVideos.id, libraryItems.videoId))
    .where(eq(libraryItems.userId, userId))
    .orderBy(desc(libraryItems.capturedAt), desc(libraryItems.id))
    .limit(SAVED_PAGE_SIZE)
    .offset((safePage - 1) * SAVED_PAGE_SIZE);

  return { items, total, page: safePage, pageCount };
}

/**
 * The current user's saved item for one YouTube video, with the full
 * ordered Transcript. Returns `null` when the user has no item for the
 * video - covering both nonexistent videos and other users' items, so
 * callers can answer a uniform 404 without leaking which case occurred.
 */
export async function getSavedItem(
  db: Database,
  userId: string,
  youtubeVideoId: string,
): Promise<SavedItemDetail | null> {
  const rows = await db
    .select({
      capturedAt: libraryItems.capturedAt,
      transcriptId: libraryItems.transcriptId,
      videoId: canonicalVideos.youtubeVideoId,
      url: canonicalVideos.sourceUrl,
      title: canonicalVideos.title,
      channelName: canonicalVideos.channelName,
      channelUrl: canonicalVideos.channelUrl,
      description: canonicalVideos.description,
      publishedAt: canonicalVideos.publishedAt,
      durationSeconds: canonicalVideos.durationSeconds,
    })
    .from(libraryItems)
    .innerJoin(canonicalVideos, eq(canonicalVideos.id, libraryItems.videoId))
    .where(
      and(
        eq(libraryItems.userId, userId),
        eq(canonicalVideos.youtubeVideoId, youtubeVideoId),
      ),
    )
    .limit(1);
  const item = rows[0];
  if (!item) return null;

  const [itemSegments, itemChapters] = await Promise.all([
    db
      .select({ start: segments.startSeconds, text: segments.text })
      .from(segments)
      .where(eq(segments.transcriptId, item.transcriptId))
      .orderBy(asc(segments.position)),
    db
      .select({ start: chapters.startSeconds, title: chapters.title })
      .from(chapters)
      .where(eq(chapters.transcriptId, item.transcriptId))
      .orderBy(asc(chapters.position)),
  ]);

  return {
    videoId: item.videoId,
    url: item.url,
    title: item.title,
    channelName: item.channelName,
    channelUrl: item.channelUrl,
    description: item.description,
    publishedAt: item.publishedAt,
    durationSeconds: item.durationSeconds,
    capturedAt: item.capturedAt,
    segments: itemSegments,
    chapters: itemChapters,
  };
}
