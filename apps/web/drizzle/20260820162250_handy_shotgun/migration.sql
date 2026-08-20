CREATE TABLE "library_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"transcript_id" uuid,
	"visibility" varchar(16) DEFAULT 'private' NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_items_visibility_valid" CHECK ("visibility" in ('private', 'published'))
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"transcript_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"start_seconds" integer NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "chapters_position_nonnegative" CHECK ("position" >= 0),
	CONSTRAINT "chapters_start_seconds_nonnegative" CHECK ("start_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"transcript_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"start_seconds" integer NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "segments_position_nonnegative" CHECK ("position" >= 0),
	CONSTRAINT "segments_start_seconds_nonnegative" CHECK ("start_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"video_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "library_items_user_video_unique" ON "library_items" ("user_id","video_id");--> statement-breakpoint
CREATE INDEX "library_items_user_id_idx" ON "library_items" ("user_id");--> statement-breakpoint
CREATE INDEX "library_items_transcript_id_idx" ON "library_items" ("transcript_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_transcript_position_unique" ON "chapters" ("transcript_id","position");--> statement-breakpoint
CREATE INDEX "chapters_transcript_id_idx" ON "chapters" ("transcript_id");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_transcript_position_unique" ON "segments" ("transcript_id","position");--> statement-breakpoint
CREATE INDEX "segments_transcript_id_idx" ON "segments" ("transcript_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_video_content_hash_unique" ON "transcripts" ("video_id","content_hash");--> statement-breakpoint
CREATE INDEX "transcripts_video_id_idx" ON "transcripts" ("video_id");--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_video_id_canonical_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "canonical_videos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_transcript_id_transcripts_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_transcript_id_transcripts_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_transcript_id_transcripts_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_video_id_canonical_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "canonical_videos"("id") ON DELETE CASCADE;