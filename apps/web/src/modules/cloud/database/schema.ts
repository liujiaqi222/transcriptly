import { defineRelationsPart, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const authRelations = defineRelationsPart(
  { user, session, account, verification },
  (relations) => ({
    user: {
      sessions: relations.many.session({
        from: relations.user.id,
        to: relations.session.userId,
      }),
      accounts: relations.many.account({
        from: relations.user.id,
        to: relations.account.userId,
      }),
    },
    session: {
      user: relations.one.user({
        from: relations.session.userId,
        to: relations.user.id,
      }),
    },
    account: {
      user: relations.one.user({
        from: relations.account.userId,
        to: relations.user.id,
      }),
    },
  }),
);

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
