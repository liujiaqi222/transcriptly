import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The cloud's shared identity for a YouTube channel, derived from the channel
 * URL path captured alongside a video (e.g. `@veritasium` or
 * `channel/UCxxxx`). `name` follows the latest capture that referenced this
 * channel; `avatarUrl` is backfilled by future capture-side work and stays
 * nullable until then.
 */
export const channels = pgTable(
  "channels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Channel URL path: `@handle` or legacy `channel/UC…`/`user/…`/`c/…`. */
    handle: text("handle").notNull(),
    /** URL identity derived from `handle` at write time (#96). */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("channels_handle_unique").on(table.handle),
    uniqueIndex("channels_slug_unique").on(table.slug),
    check("channels_handle_nonempty", sql`${table.handle} <> ''`),
  ],
);
