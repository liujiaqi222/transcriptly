CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"handle" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_handle_nonempty" CHECK ("handle" <> '')
);
--> statement-breakpoint
ALTER TABLE "canonical_videos" ADD COLUMN "channel_id" uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX "channels_handle_unique" ON "channels" ("handle");--> statement-breakpoint
-- Backfill: build one channel row per distinct legacy channel URL, keeping the
-- most recently captured channel name (#96). The handle is the channel URL
-- path (`@handle`, `channel/UC…`, `user/…`, `c/…`); videos whose channel URL
-- was empty stay unchannelled.
INSERT INTO "channels" ("handle", "name")
SELECT
	ch."handle",
	(
		SELECT cv2."channel_name"
		FROM "canonical_videos" cv2
		WHERE split_part(cv2."channel_url", 'youtube.com', 2) = ch."handle"
		ORDER BY cv2."source_captured_at" DESC, cv2."id" DESC
		LIMIT 1
	)
FROM (
	SELECT DISTINCT split_part("channel_url", 'youtube.com', 2) AS "handle"
	FROM "canonical_videos"
	WHERE "channel_url" LIKE 'https://www.youtube.com/%'
) ch
ON CONFLICT ("handle") DO NOTHING;
--> statement-breakpoint
UPDATE "canonical_videos" cv
SET "channel_id" = c."id"
FROM "channels" c
WHERE cv."channel_url" LIKE 'https://www.youtube.com/%'
	AND c."handle" = split_part(cv."channel_url", 'youtube.com', 2);
--> statement-breakpoint
ALTER TABLE "canonical_videos" DROP CONSTRAINT "canonical_videos_duration_seconds_nonnegative";
--> statement-breakpoint
ALTER TABLE "canonical_videos" DROP COLUMN "channel_name";--> statement-breakpoint
ALTER TABLE "canonical_videos" DROP COLUMN "channel_url";--> statement-breakpoint
CREATE INDEX "canonical_videos_channel_id_idx" ON "canonical_videos" ("channel_id");--> statement-breakpoint
ALTER TABLE "canonical_videos" ADD CONSTRAINT "canonical_videos_channel_id_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "canonical_videos" ADD CONSTRAINT "canonical_videos_duration_seconds_nonnegative" CHECK ("canonical_videos"."duration_seconds" is null or "canonical_videos"."duration_seconds" >= 0);
