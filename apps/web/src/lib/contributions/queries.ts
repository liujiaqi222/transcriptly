import { asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  canonicalVideos,
  channels,
  contributions,
  publicPublications,
} from "../../db/schema";
import { channelUrlFromHandle } from "../channels/queries";

export type UserContributionSummary = {
  videoId: string;
  title: string;
  channelName: string;
  channelUrl: string;
  durationSeconds: number | null;
  contributedAt: Date;
  publicationUpdatedAt: Date | null;
};

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
      channelName: channels.name,
      channelUrl: sql<string>`coalesce(${channels.handle}, '')`,
      durationSeconds: canonicalVideos.durationSeconds,
      contributedAt: contributions.createdAt,
      publicationUpdatedAt: publicPublications.updatedAt,
    })
    .from(contributions)
    .innerJoin(canonicalVideos, eq(canonicalVideos.id, contributions.videoId))
    .leftJoin(channels, eq(channels.id, canonicalVideos.channelId))
    .leftJoin(
      publicPublications,
      eq(publicPublications.videoId, contributions.videoId),
    )
    .where(eq(contributions.userId, userId))
    .orderBy(desc(contributions.createdAt), asc(contributions.id))
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        channelName: row.channelName ?? "",
        channelUrl: row.channelUrl ? channelUrlFromHandle(row.channelUrl) : "",
      })),
    );
}
