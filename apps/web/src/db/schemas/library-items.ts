import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { canonicalVideos } from "./canonical-videos";
import { transcripts } from "./transcripts";

/**
 * A user's current cloud relationship to one Canonical Video. `(user_id,
 * video_id)` is the per-user idempotency key: each user has at most one Item
 * per video (#10). An Item only holds the current state - the active
 * Transcript, the capture time and the publication status - never history.
 *
 * `visibility` is a two-state `private ⇄ published` machine, defaulting to
 * private on first upload (#10). New uploads default private; a published Item
 * receiving a new capture stays published.
 */
export const libraryItems = pgTable(
  "library_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => canonicalVideos.id, { onDelete: "cascade" }),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id, {
        // A shared Transcript is only removed once no Item references it (app
        // cleanup within the upload transaction); RESTRICT keeps an Item from
        // silently losing its body if cleanup ordering ever breaks.
        onDelete: "restrict",
      }),
    visibility: varchar("visibility", { length: 16 })
      .default("private")
      .notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("library_items_user_video_unique").on(
      table.userId,
      table.videoId,
    ),
    index("library_items_user_id_idx").on(table.userId),
    index("library_items_transcript_id_idx").on(table.transcriptId),
    check(
      "library_items_visibility_valid",
      sql`${table.visibility} in ('private', 'published')`,
    ),
  ],
);
