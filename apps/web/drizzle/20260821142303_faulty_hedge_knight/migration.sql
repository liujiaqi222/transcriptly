CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "segments" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "text")) STORED;--> statement-breakpoint
CREATE INDEX "segments_search_vector_idx" ON "segments" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "segments_text_trgm_idx" ON "segments" USING gin ("text" gin_trgm_ops);