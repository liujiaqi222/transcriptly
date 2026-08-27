import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  canonicalVideos,
  chapters,
  contributions,
  publicPublications,
  segments,
  user,
} from "../../db/schema";

export type PublicTranscriptSummary = {
  videoId: string;
  title: string;
  channelName: string;
  description: string;
  publishedAt: Date | null;
  durationSeconds: number | null;
  publicationUpdatedAt: Date;
  segmentCount: number;
};

export type PublicTranscriptDetail = PublicTranscriptSummary & {
  url: string;
  channelUrl: string;
  publicPublishedAt: Date;
  contributor: { displayName: string; avatarUrl: string | null } | null;
  segments: { start: number; text: string }[];
  chapters: { start: number; title: string }[];
};

const segmentCount = sql<number>`(
  select count(*)::int
  from ${segments}
  where ${segments.transcriptId} = ${publicPublications.currentTranscriptId}
)`;

export async function listPublicTranscripts(
  db: Database,
  limit = 6,
): Promise<PublicTranscriptSummary[]> {
  return db
    .select({
      videoId: canonicalVideos.youtubeVideoId,
      title: canonicalVideos.title,
      channelName: canonicalVideos.channelName,
      description: canonicalVideos.description,
      publishedAt: canonicalVideos.publishedAt,
      durationSeconds: canonicalVideos.durationSeconds,
      publicationUpdatedAt: publicPublications.updatedAt,
      segmentCount,
    })
    .from(publicPublications)
    .innerJoin(
      canonicalVideos,
      eq(canonicalVideos.id, publicPublications.videoId),
    )
    .where(eq(publicPublications.active, true))
    .orderBy(desc(publicPublications.publishedAt), desc(publicPublications.id))
    .limit(Math.max(1, Math.min(limit, 24)));
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
      channelName: canonicalVideos.channelName,
      channelUrl: canonicalVideos.channelUrl,
      description: canonicalVideos.description,
      publishedAt: canonicalVideos.publishedAt,
      durationSeconds: canonicalVideos.durationSeconds,
      publicationUpdatedAt: publicPublications.updatedAt,
      publicPublishedAt: publicPublications.publishedAt,
      segmentCount,
      contributorName: user.name,
      contributorAvatar: user.image,
    })
    .from(publicPublications)
    .innerJoin(
      canonicalVideos,
      eq(canonicalVideos.id, publicPublications.videoId),
    )
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
    channelUrl: item.channelUrl,
    description: item.description,
    publishedAt: item.publishedAt,
    durationSeconds: item.durationSeconds,
    publicationUpdatedAt: item.publicationUpdatedAt,
    publicPublishedAt: item.publicPublishedAt,
    segmentCount: item.segmentCount,
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
