import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { canonicalVideos } from "./canonical-videos";

/**
 * The immutable, canonical transcript body for one Canonical Video. Shared
 * across users when their ordered Segments/Chapters hash to the same value
 * (#10, #34). `content_hash` is the server-computed UTF-8 SHA-256 of the
 * stable `{ segments, chapters: [] }` representation; client hashes are never
 * trusted. A Transcript is deleted only once no Library Item references it.
 */
export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => canonicalVideos.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("transcripts_video_content_hash_unique").on(
      table.videoId,
      table.contentHash,
    ),
    index("transcripts_video_id_idx").on(table.videoId),
  ],
);

/** Ordered transcript entries. `position` is authoritative for ordering. */
export const segments = pgTable(
  "segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startSeconds: integer("start_seconds").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    uniqueIndex("segments_transcript_position_unique").on(
      table.transcriptId,
      table.position,
    ),
    index("segments_transcript_id_idx").on(table.transcriptId),
    check("segments_position_nonnegative", sql`${table.position} >= 0`),
    check(
      "segments_start_seconds_nonnegative",
      sql`${table.startSeconds} >= 0`,
    ),
  ],
);

/** Ordered creator-defined chapter headings. Participates in the content hash. */
export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startSeconds: integer("start_seconds").notNull(),
    title: text("title").notNull(),
  },
  (table) => [
    uniqueIndex("chapters_transcript_position_unique").on(
      table.transcriptId,
      table.position,
    ),
    index("chapters_transcript_id_idx").on(table.transcriptId),
    check("chapters_position_nonnegative", sql`${table.position} >= 0`),
    check(
      "chapters_start_seconds_nonnegative",
      sql`${table.startSeconds} >= 0`,
    ),
  ],
);
