-- Backfill channel for GLvFTMtw4Jk (collab video saved before channel extraction fix)
INSERT INTO "channels" ("handle", "slug", "name", "avatar_url")
VALUES (
  '/@LennysPodcast',
  'lennyspodcast',
  'Lenny''s Podcast',
  'https://yt3.ggpht.com/Wk7-4UW17JqDXgVWDiE7s1gJxDkt_UwNa2oNw8OYRwc9deiCv2V2fFAdNgByDi0K9AAF0YMj=s88-c-k-c0x00ffffff-no-rj'
)
ON CONFLICT ("handle") DO UPDATE
SET "name" = 'Lenny''s Podcast',
    "avatar_url" = COALESCE(EXCLUDED."avatar_url", "channels"."avatar_url");
--> statement-breakpoint
UPDATE "channels"
SET "name" = 'Lenny''s Podcast'
WHERE ("slug" ILIKE 'lennyspodcast' OR "handle" ILIKE '%lennyspodcast%') AND "name" <> 'Lenny''s Podcast';
--> statement-breakpoint
UPDATE "canonical_videos"
SET "channel_id" = (SELECT "id" FROM "channels" WHERE "slug" ILIKE 'lennyspodcast' OR "handle" ILIKE '%lennyspodcast%' LIMIT 1)
WHERE "youtube_video_id" = 'GLvFTMtw4Jk' AND "channel_id" IS NULL;
