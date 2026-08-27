import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { canonicalVideos } from "./canonical-videos";
import { transcripts } from "./transcripts";

/** One-time acknowledgement of the identity fields exposed with contributions. */
export const publicProfileConsents = pgTable(
  "public_profile_consents",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId] })],
);

/**
 * A user's durable contribution relationship to a video. It intentionally has
 * no Transcript foreign key: a Contribution is not a historical content
 * version, and `(user_id, video_id)` is its idempotency boundary.
 */
export const contributions = pgTable(
  "contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    videoId: uuid("video_id")
      .notNull()
      .references(() => canonicalVideos.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("contributions_user_video_unique").on(
      table.userId,
      table.videoId,
    ),
    index("contributions_video_id_idx").on(table.videoId),
  ],
);

/**
 * The public read boundary for one video. A row selects the current complete
 * Transcript and its attribution. Captures and Contributions never become
 * readable merely by existing; every public query starts here and requires
 * `active = true`.
 */
export const publicPublications = pgTable(
  "public_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => canonicalVideos.id, { onDelete: "cascade" }),
    currentTranscriptId: uuid("current_transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "restrict" }),
    contributionId: uuid("contribution_id").references(() => contributions.id, {
      onDelete: "restrict",
    }),
    source: varchar("source", { length: 16 }).default("contribution").notNull(),
    active: boolean("active").default(true).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("public_publications_video_unique").on(table.videoId),
    index("public_publications_current_transcript_idx").on(
      table.currentTranscriptId,
    ),
    check(
      "public_publications_source_valid",
      sql`${table.source} in ('contribution', 'bootstrap')`,
    ),
    check(
      "public_publications_attribution_valid",
      sql`(${table.source} = 'contribution' and ${table.contributionId} is not null) or (${table.source} = 'bootstrap' and ${table.contributionId} is null)`,
    ),
  ],
);
