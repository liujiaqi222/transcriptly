import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** The cloud's shared identity and current Source for a YouTube video. */
export const canonicalVideos = pgTable(
  "canonical_videos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    youtubeVideoId: varchar("youtube_video_id", { length: 11 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    channelName: text("channel_name").notNull(),
    channelUrl: text("channel_url").notNull(),
    description: text("description").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    sourceCapturedAt: timestamp("source_captured_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("canonical_videos_youtube_video_id_unique").on(
      table.youtubeVideoId,
    ),
    check(
      "canonical_videos_duration_seconds_nonnegative",
      sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`,
    ),
  ],
);
