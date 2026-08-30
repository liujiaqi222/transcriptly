import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  canonicalVideos,
  channels,
  chapters,
  contributions,
  publicPublications,
  segments,
  user,
} from "../../db/schema";
import { channelUrlFromHandle } from "../channels/queries";

export const TRANSCRIPT_PAGE_SIZE = 24;

export type PublicTranscriptSummary = {
  videoId: string;
  title: string;
  channelName: string | null;
  channelHandle: string | null;
  channelSlug: string | null;
  description: string;
  publishedAt: Date | null;
  durationSeconds: number | null;
  publicationUpdatedAt: Date;
};

export type PublicTranscriptDetail = PublicTranscriptSummary & {
  url: string;
  channelUrl: string;
  publicPublishedAt: Date;
  contributor: { displayName: string; avatarUrl: string | null } | null;
  segments: { start: number; text: string }[];
  chapters: { start: number; title: string }[];
};

const baseSummary = {
  videoId: canonicalVideos.youtubeVideoId,
  title: canonicalVideos.title,
  channelName: channels.name,
  channelHandle: channels.handle,
  channelSlug: channels.slug,
  description: canonicalVideos.description,
  publishedAt: canonicalVideos.publishedAt,
  durationSeconds: canonicalVideos.durationSeconds,
  publicationUpdatedAt: publicPublications.updatedAt,
};

/** Counts published transcripts for pagination (#96). */
export async function countPublicTranscripts(
  db: Database,
  query?: string,
): Promise<number> {
  const conditions = [eq(publicPublications.active, true)];
  if (query) {
    const pattern = `%${query}%`;
    const match = or(
      ilike(canonicalVideos.title, pattern),
      ilike(channels.name, pattern),
    );
    if (match) conditions.push(match);
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(publicPublications)
    .innerJoin(
      canonicalVideos,
      eq(canonicalVideos.id, publicPublications.videoId),
    )
    .leftJoin(channels, eq(channels.id, canonicalVideos.channelId))
    .where(and(...conditions));
  return row?.count ?? 0;
}

/**
 * One page of published transcripts, ordered by publication recency (#96).
 * With `query`, filters by title or channel name substring (scope: videos).
 */
export async function listPublicTranscripts(
  db: Database,
  page = 1,
  query?: string,
  pageSize = TRANSCRIPT_PAGE_SIZE,
): Promise<PublicTranscriptSummary[]> {
  const conditions = [eq(publicPublications.active, true)];
  if (query) {
    const pattern = `%${query}%`;
    const match = or(
      ilike(canonicalVideos.title, pattern),
      ilike(channels.name, pattern),
    );
    if (match) conditions.push(match);
  }
  return db
    .select(baseSummary)
    .from(publicPublications)
    .innerJoin(
      canonicalVideos,
      eq(canonicalVideos.id, publicPublications.videoId),
    )
    .leftJoin(channels, eq(channels.id, canonicalVideos.channelId))
    .where(and(...conditions))
    .orderBy(desc(publicPublications.publishedAt), desc(publicPublications.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

export async function listPublicTranscriptUrls(
  db: Database,
): Promise<{ videoId: string; updatedAt: Date }[]> {
  return db
    .select({
      videoId: canonicalVideos.youtubeVideoId,
      updatedAt: publicPublications.updatedAt,
    })
    .from(publicPublications)
    .innerJoin(
      canonicalVideos,
      eq(canonicalVideos.id, publicPublications.videoId),
    )
    .where(eq(publicPublications.active, true))
    .orderBy(desc(publicPublications.updatedAt));
}

export async function getPublicTranscript(
  db: Database,
  youtubeVideoId: string,
): Promise<PublicTranscriptDetail | null> {
  const [item] = await db
    .select({
      transcriptId: publicPublications.currentTranscriptId,
      videoId: canonicalVideos.youtubeVideoId,
      url: canonicalVideos.sourceUrl,
      title: canonicalVideos.title,
      channelName: channels.name,
      channelHandle: channels.handle,
      channelSlug: channels.slug,
      description: canonicalVideos.description,
      publishedAt: canonicalVideos.publishedAt,
      durationSeconds: canonicalVideos.durationSeconds,
      publicationUpdatedAt: publicPublications.updatedAt,
      publicPublishedAt: publicPublications.publishedAt,
      contributorName: user.name,
      contributorAvatar: user.image,
    })
    .from(publicPublications)
    .innerJoin(
      canonicalVideos,
      eq(canonicalVideos.id, publicPublications.videoId),
    )
    .leftJoin(channels, eq(channels.id, canonicalVideos.channelId))
    .leftJoin(
      contributions,
      eq(contributions.id, publicPublications.contributionId),
    )
    .leftJoin(user, eq(user.id, contributions.userId))
    .where(
      and(
        eq(publicPublications.active, true),
        eq(canonicalVideos.youtubeVideoId, youtubeVideoId),
      ),
    )
    .limit(1);
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
  if (itemSegments.length === 0) return null;

  return {
    videoId: item.videoId,
    url: item.url,
    title: item.title,
    channelName: item.channelName,
    channelHandle: item.channelHandle,
    channelSlug: item.channelSlug,
    channelUrl: item.channelHandle
      ? channelUrlFromHandle(item.channelHandle)
      : "",
    description: item.description,
    publishedAt: item.publishedAt,
    durationSeconds: item.durationSeconds,
    publicationUpdatedAt: item.publicationUpdatedAt,
    publicPublishedAt: item.publicPublishedAt,
    contributor: item.contributorName
      ? {
          displayName: item.contributorName,
          avatarUrl: item.contributorAvatar,
        }
      : null,
    segments: itemSegments,
    chapters: itemChapters,
  };
}
