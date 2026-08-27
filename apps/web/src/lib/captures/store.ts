import type { Capture } from "@transcriptly/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  canonicalVideos,
  chapters,
  segments,
  transcripts,
} from "../../db/schema";
import { transcriptBody } from "./hash";

export class TranscriptHashCollisionError extends Error {
  readonly code = "transcript_hash_collision";

  constructor() {
    super("The transcript content hash does not match the stored transcript.");
    this.name = "TranscriptHashCollisionError";
  }
}

type CaptureTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function findOrCreateTranscript(
  tx: CaptureTransaction,
  videoId: string,
  capture: Capture,
  contentHash: string,
): Promise<string> {
  const inserted = await tx
    .insert(transcripts)
    .values({ videoId, contentHash })
    .onConflictDoNothing({
      target: [transcripts.videoId, transcripts.contentHash],
    })
    .returning({ id: transcripts.id });

  const transcriptId = inserted[0]?.id;
  if (transcriptId) {
    await tx.insert(segments).values(
      capture.segments.map((segment, position) => ({
        transcriptId,
        position,
        startSeconds: segment.start,
        text: segment.text,
      })),
    );
    const chaptersToInsert = capture.chapters ?? [];
    if (chaptersToInsert.length > 0) {
      await tx.insert(chapters).values(
        chaptersToInsert.map((chapter, position) => ({
          transcriptId,
          position,
          startSeconds: chapter.start,
          title: chapter.title,
        })),
      );
    }
    return transcriptId;
  }

  const existing = await tx
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(
      and(
        eq(transcripts.videoId, videoId),
        eq(transcripts.contentHash, contentHash),
      ),
    )
    .limit(1);
  const existingId = existing[0]?.id;
  if (!existingId) {
    throw new Error("Transcript was not available after conflict resolution.");
  }

  const storedSegments = await tx
    .select({ start: segments.startSeconds, text: segments.text })
    .from(segments)
    .where(eq(segments.transcriptId, existingId))
    .orderBy(asc(segments.position));
  const storedChapters = await tx
    .select({ start: chapters.startSeconds, title: chapters.title })
    .from(chapters)
    .where(eq(chapters.transcriptId, existingId))
    .orderBy(asc(chapters.position));
  const storedBody = {
    segments: storedSegments,
    chapters: storedChapters,
  };
  if (JSON.stringify(storedBody) !== JSON.stringify(transcriptBody(capture))) {
    throw new TranscriptHashCollisionError();
  }
  return existingId;
}

export async function updateCanonicalVideo(
  tx: CaptureTransaction,
  capture: Capture,
  capturedAt: Date,
): Promise<string> {
  const source = capture.source;
  const inserted = await tx
    .insert(canonicalVideos)
    .values({
      youtubeVideoId: source.videoId,
      sourceUrl: source.url,
      title: source.title,
      channelName: source.channelName,
      channelUrl: source.channelUrl,
      description: source.description,
      publishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
      durationSeconds: source.durationSeconds,
      sourceCapturedAt: capturedAt,
    })
    .onConflictDoUpdate({
      target: canonicalVideos.youtubeVideoId,
      set: {
        sourceUrl: sql`excluded.source_url`,
        title: sql`excluded.title`,
        channelName: sql`excluded.channel_name`,
        channelUrl: sql`coalesce(nullif(excluded.channel_url, ''), ${canonicalVideos.channelUrl})`,
        description: sql`excluded.description`,
        publishedAt: sql`coalesce(excluded.published_at, ${canonicalVideos.publishedAt})`,
        durationSeconds: sql`coalesce(excluded.duration_seconds, ${canonicalVideos.durationSeconds})`,
        sourceCapturedAt: sql`excluded.source_captured_at`,
        updatedAt: sql`now()`,
      },
      where: sql`excluded.source_captured_at > ${canonicalVideos.sourceCapturedAt}`,
    })
    .returning({ id: canonicalVideos.id });

  if (inserted[0]?.id) return inserted[0].id;
  const existing = await tx
    .select({ id: canonicalVideos.id })
    .from(canonicalVideos)
    .where(eq(canonicalVideos.youtubeVideoId, source.videoId))
    .limit(1);
  const id = existing[0]?.id;
  if (!id) throw new Error("Canonical Video was not available after upsert.");
  return id;
}
