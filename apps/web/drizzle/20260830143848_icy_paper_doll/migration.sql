ALTER TABLE "channels" ADD COLUMN "slug" text;
--> statement-breakpoint
-- Backfill: the slug is the sanitized, lowercased handle (#96). Matches the
-- application-side channelSlug(): lowercase, non-[a-z0-9-] runs become "-",
-- leading/trailing "-" trimmed.
UPDATE "channels"
SET "slug" = btrim(regexp_replace(lower("handle"), '[^a-z0-9-]+', '-', 'g'), '-');
--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "channels_slug_unique" ON "channels" ("slug");--> statement-breakpoint
ALTER TABLE "canonical_videos" DROP CONSTRAINT "canonical_videos_duration_seconds_nonnegative", ADD CONSTRAINT "canonical_videos_duration_seconds_nonnegative" CHECK ("canonical_videos"."duration_seconds" is null or "canonical_videos"."duration_seconds" >= 0);
