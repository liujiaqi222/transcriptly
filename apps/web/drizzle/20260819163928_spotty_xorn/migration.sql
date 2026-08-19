CREATE TABLE "canonical_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"youtube_video_id" varchar(11) NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"channel_name" text NOT NULL,
	"channel_url" text NOT NULL,
	"description" text NOT NULL,
	"published_at" timestamp with time zone,
	"duration_seconds" integer,
	"source_captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_videos_duration_seconds_nonnegative" CHECK ("duration_seconds" is null or "duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_videos_youtube_video_id_unique" ON "canonical_videos" ("youtube_video_id");