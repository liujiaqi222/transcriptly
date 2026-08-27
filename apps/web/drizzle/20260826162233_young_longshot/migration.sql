-- The owner explicitly approved publishing every legacy Library Item during
-- the Issue #64 migration. Treat that approval as the one-time public profile
-- confirmation for each legacy uploader.
INSERT INTO "public_profile_consents" ("user_id", "confirmed_at")
SELECT DISTINCT "user_id", now()
FROM "library_items"
ON CONFLICT ("user_id") DO NOTHING;
--> statement-breakpoint

-- Contribution records express user x video identity and deliberately do not
-- bind to one historical transcript version.
INSERT INTO "contributions" ("user_id", "video_id", "created_at")
SELECT "user_id", "video_id", "captured_at"
FROM "library_items"
ON CONFLICT ("user_id", "video_id") DO NOTHING;
--> statement-breakpoint

-- If more than one legacy user captured a video, publish the most recently
-- captured complete transcript. All user x video Contributions remain stored.
INSERT INTO "public_publications" (
	"video_id",
	"current_transcript_id",
	"contribution_id",
	"source",
	"active",
	"published_at",
	"updated_at"
)
SELECT DISTINCT ON (li."video_id")
	li."video_id",
	li."transcript_id",
	c."id",
	'contribution',
	true,
	li."captured_at",
	li."updated_at"
FROM "library_items" li
INNER JOIN "contributions" c
	ON c."user_id" = li."user_id" AND c."video_id" = li."video_id"
WHERE EXISTS (
	SELECT 1 FROM "segments" s WHERE s."transcript_id" = li."transcript_id"
)
ORDER BY li."video_id", li."captured_at" DESC, li."id" DESC
ON CONFLICT ("video_id") DO NOTHING;
--> statement-breakpoint

DROP TABLE "library_items";
