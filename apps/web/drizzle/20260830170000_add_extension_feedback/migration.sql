CREATE TABLE IF NOT EXISTS "extension_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source" varchar(32) DEFAULT 'uninstall' NOT NULL,
  "rating" integer NOT NULL,
  "reasons" text[] DEFAULT '{}'::text[] NOT NULL,
  "details" jsonb,
  "contact_email" varchar(320),
  "extension_version" varchar(32),
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "extension_feedback_created_at_idx" ON "extension_feedback" USING btree ("created_at");
--> statement-breakpoint
ALTER TABLE "extension_feedback" ADD CONSTRAINT "extension_feedback_rating_range" CHECK ("extension_feedback"."rating" BETWEEN 1 AND 5);
