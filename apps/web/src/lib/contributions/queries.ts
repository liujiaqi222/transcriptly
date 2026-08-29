import { asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  canonicalVideos,
  contributions,
  publicPublications,
  segments,
} from "../../db/schema";

export type UserContributionSummary = {
  videoId: string;
  title: string;
  channelName: string;
  channelUrl: string;
  durationSeconds: number | null;
  contributedAt: Date;
  publicationUpdatedAt: Date | null;
  segmentCount: number;
};

const segmentCount = sql<number>`(
  select count(*)::int
  from ${segments}
  where ${segments.transcriptId} = ${publicPublications.currentTranscriptId}
)`;

/**
 * One row per video the user currently contributes to (#74). A Contribution
 * row exists only while active - withdrawal deletes it - so the list is the
 * user's current Contributions by construction. The Publication join is a
 * left join because the final contributor's withdrawal removes the
 * Publication row; until then it reflects the public state of the video.
 */
export async function listUserContributions(
  db: Database,
  userId: string,
): Promise<UserContributionSummary[]> {
  return db
    .select({
      videoId: canonicalVideos.youtubeVideoId,
      title: canonicalVideos.title,
      channelName: canonicalVideos.channelName,
      channelUrl: canonicalVideos.channelUrl,
      durationSeconds: canonicalVideos.durationSeconds,
      contributedAt: contributions.createdAt,
      publicationUpdatedAt: publicPublications.updatedAt,
      segmentCount,
    })
    .from(contributions)
    .innerJoin(canonicalVideos, eq(canonicalVideos.id, contributions.videoId))
    .leftJoin(
      publicPublications,
      eq(publicPublications.videoId, contributions.videoId),
    )
    .where(eq(contributions.userId, userId))
    .orderBy(desc(contributions.createdAt), asc(contributions.id));
}
