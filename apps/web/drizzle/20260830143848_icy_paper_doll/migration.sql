ALTER TABLE "channels" ADD COLUMN "slug" text;
--> statement-breakpoint
-- Preserve URL-safe handle punctuation instead of collapsing distinct
-- handles such as `@a.b`, `@a_b`, and `@a-b` onto one slug.
UPDATE "channels"
SET "slug" = coalesce(
	nullif(
		btrim(
			regexp_replace(
				regexp_replace(
					regexp_replace("handle", '^/?@', ''),
					'^/+|/+$',
					'',
					'g'
				),
				'[^A-Za-z0-9._~-]+',
				'-',
				'g'
			),
			'-'
		),
		''
	),
	'channel'
);
--> statement-breakpoint
ALTER TABLE "channels" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "channels_slug_unique" ON "channels" ("slug");--> statement-breakpoint
ALTER TABLE "canonical_videos" DROP CONSTRAINT "canonical_videos_duration_seconds_nonnegative", ADD CONSTRAINT "canonical_videos_duration_seconds_nonnegative" CHECK ("canonical_videos"."duration_seconds" is null or "canonical_videos"."duration_seconds" >= 0);
