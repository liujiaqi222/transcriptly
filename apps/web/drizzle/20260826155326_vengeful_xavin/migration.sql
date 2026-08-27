CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_profile_consents" (
	"user_id" uuid PRIMARY KEY,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"video_id" uuid NOT NULL,
	"current_transcript_id" uuid NOT NULL,
	"contribution_id" uuid,
	"source" varchar(16) DEFAULT 'contribution' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_publications_source_valid" CHECK ("source" in ('contribution', 'bootstrap')),
	CONSTRAINT "public_publications_attribution_valid" CHECK (("source" = 'contribution' and "contribution_id" is not null) or ("source" = 'bootstrap' and "contribution_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_user_video_unique" ON "contributions" ("user_id","video_id");--> statement-breakpoint
CREATE INDEX "contributions_video_id_idx" ON "contributions" ("video_id");--> statement-breakpoint
CREATE UNIQUE INDEX "public_publications_video_unique" ON "public_publications" ("video_id");--> statement-breakpoint
CREATE INDEX "public_publications_current_transcript_idx" ON "public_publications" ("current_transcript_id");--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_video_id_canonical_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "canonical_videos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "public_profile_consents" ADD CONSTRAINT "public_profile_consents_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "public_publications" ADD CONSTRAINT "public_publications_video_id_canonical_videos_id_fkey" FOREIGN KEY ("video_id") REFERENCES "canonical_videos"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "public_publications" ADD CONSTRAINT "public_publications_current_transcript_id_transcripts_id_fkey" FOREIGN KEY ("current_transcript_id") REFERENCES "transcripts"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "public_publications" ADD CONSTRAINT "public_publications_contribution_id_contributions_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "contributions"("id") ON DELETE RESTRICT;