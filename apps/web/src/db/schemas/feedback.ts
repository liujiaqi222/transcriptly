import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Anonymous product feedback, captured when the extension is uninstalled. */
export const extensionFeedback = pgTable(
  "extension_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: varchar("source", { length: 32 }).notNull().default("uninstall"),
    rating: integer("rating").notNull(),
    reasons: text("reasons").array().notNull().default(sql`'{}'::text[]`),
    // Per-reason follow-up text, keyed by the reason it elaborates.
    details: jsonb("details").$type<Record<string, string>>(),
    contactEmail: varchar("contact_email", { length: 320 }),
    extensionVersion: varchar("extension_version", { length: 32 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("extension_feedback_created_at_idx").on(table.createdAt),
    // Declared here, not only in the migration, so this schema stays the
    // single source of truth for future drizzle-kit diffs (#104).
    check(
      "extension_feedback_rating_range",
      sql`${table.rating} between 1 and 5`,
    ),
  ],
);
