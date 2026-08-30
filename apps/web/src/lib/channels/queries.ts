import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { canonicalVideos, channels, publicPublications } from "../../db/schema";

export const CHANNEL_PAGE_SIZE = 24;

export type ChannelSummary = {
  id: string;
  handle: string;
  slug: string;
  name: string;
  transcriptCount: number;
  latestPublicationAt: Date | null;
};

/** Postgres renders max(timestamptz) as text through the SQL subquery. */
type ChannelRow = Omit<ChannelSummary, "latestPublicationAt"> & {
  latestPublicationAt: string | null;
};

function toChannelSummary(row: ChannelRow): ChannelSummary {
  return {
    ...row,
    latestPublicationAt: row.latestPublicationAt
      ? new Date(row.latestPublicationAt)
      : null,
  };
}

export type ChannelVideoSummary = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date | null;
  durationSeconds: number | null;
  publicationUpdatedAt: Date;
};

/** Derives the public channel URL from the stored handle. */
export function channelUrlFromHandle(handle: string): string {
  return `https://www.youtube.com${handle.startsWith("/") ? handle : `/${handle}`}`;
}

/**
 * Derives the URL slug from the handle: `@veritasium` -> `veritasium`,
 * `channel/UCxxx` -> `channel-ucxxx`. Computed once at write time and stored
 * on the channel row (#96); the unique index makes lookups index-backed.
 */
export function channelSlug(handle: string): string {
  if (handle.startsWith("@")) {
    return handle
      .slice(1)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  return handle
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const publishedCount = sql<number>`(
  select count(*)::int
  from ${publicPublications}
  inner join ${canonicalVideos}
    on ${canonicalVideos.id} = ${publicPublications.videoId}
  where ${publicPublications.active} = true
    and ${canonicalVideos.channelId} = ${channels.id}
)`;

const latestPublication = sql<string | null>`(
  select max(${publicPublications.updatedAt})::text
  from ${publicPublications}
  inner join ${canonicalVideos}
    on ${canonicalVideos.id} = ${publicPublications.videoId}
  where ${publicPublications.active} = true
    and ${canonicalVideos.channelId} = ${channels.id}
)`;

const channelColumns = {
  id: channels.id,
  handle: channels.handle,
  slug: channels.slug,
  name: channels.name,
  transcriptCount: publishedCount,
  latestPublicationAt: latestPublication,
};

/** Channels ordered by published transcript count, then recency. */
export async function listChannels(db: Database): Promise<ChannelSummary[]> {
  const rows: ChannelRow[] = await db
    .select(channelColumns)
    .from(channels)
    .where(sql`${publishedCount} > 0`)
    .orderBy(
      desc(publishedCount),
      desc(latestPublication),
      asc(channels.handle),
    );
  return rows.map(toChannelSummary);
}

const channelVideoColumns = {
  videoId: canonicalVideos.youtubeVideoId,
  title: canonicalVideos.title,
  description: canonicalVideos.description,
  publishedAt: canonicalVideos.publishedAt,
  durationSeconds: canonicalVideos.durationSeconds,
  publicationUpdatedAt: publicPublications.updatedAt,
};

const publishedVideosForChannel = (db: Database, channelId: string) =>
  db
    .select(channelVideoColumns)
    .from(publicPublications)
    .innerJoin(
      canonicalVideos,
      eq(canonicalVideos.id, publicPublications.videoId),
    )
    .where(
      and(
        eq(publicPublications.active, true),
        eq(canonicalVideos.channelId, channelId),
      ),
    )
    .orderBy(desc(publicPublications.publishedAt), desc(publicPublications.id));

export async function countChannelVideos(
  db: Database,
  channelId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(publicPublications)
    .innerJoin(
      canonicalVideos,
      eq(canonicalVideos.id, publicPublications.videoId),
    )
    .where(
      and(
        eq(publicPublications.active, true),
        eq(canonicalVideos.channelId, channelId),
      ),
    );
  return row?.count ?? 0;
}

/** One channel page of published videos, ordered by publication recency. */
export async function listChannelVideos(
  db: Database,
  channelId: string,
  page: number,
  pageSize = CHANNEL_PAGE_SIZE,
): Promise<ChannelVideoSummary[]> {
  return publishedVideosForChannel(db, channelId)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

/** Finds a channel by its stored slug via the unique index (#96). */
export async function findChannelBySlug(
  db: Database,
  slug: string,
): Promise<ChannelSummary | null> {
  const rows: ChannelRow[] = await db
    .select(channelColumns)
    .from(channels)
    .where(and(eq(channels.slug, slug), sql`${publishedCount} > 0`))
    .limit(1);
  return rows.length > 0 ? toChannelSummary(rows[0]) : null;
}
