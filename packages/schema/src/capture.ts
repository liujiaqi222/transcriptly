import { z } from "zod";

/**
 * The normalized Capture is the single shared contract between the extension
 * (producer) and the cloud (consumer). These zod schemas are the source of
 * truth: the exported TypeScript types are inferred from them, so the runtime
 * validator and the type system can never drift.
 *
 * Every object is strict: unknown fields are rejected, never stripped. The
 * extension builds these objects; the server re-validates rather than trusting
 * the client (#28, #33).
 */

/** YouTube video IDs are exactly 11 base64url characters. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export const captureSourceSchema = z
  .strictObject({
    videoId: z
      .string()
      .regex(VIDEO_ID, "must be an 11-character YouTube video id"),
    url: z.url(),
    title: z.string().trim().min(1),
    channelName: z.string().trim().min(1),
    channelUrl: z.url(),
    description: z.string(),
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
  })
  .superRefine((source, context) => {
    try {
      const url = new URL(source.url);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "www.youtube.com" ||
        url.pathname !== "/watch" ||
        url.searchParams.get("v") !== source.videoId
      ) {
        context.addIssue({
          code: "custom",
          path: ["url"],
          message: "must be the canonical YouTube watch URL",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        path: ["url"],
        message: "must be a valid URL",
      });
    }
  });

export const captureSegmentSchema = z.strictObject({
  /** Non-negative integer seconds. Order is given by array position. */
  start: z.number().int().nonnegative(),
  text: z.string().min(1),
});

export const captureChapterSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  title: z.string().min(1),
});

export const captureSchema = z.strictObject({
  source: captureSourceSchema,
  /** ISO 8601; parsed and normalized to UTC milliseconds server-side. */
  capturedAt: z.iso.datetime({ offset: true }),
  segments: z.array(captureSegmentSchema).min(1),
  chapters: z.array(captureChapterSchema).optional(),
});

export type CaptureSource = z.infer<typeof captureSourceSchema>;
export type CaptureSegment = z.infer<typeof captureSegmentSchema>;
export type CaptureChapter = z.infer<typeof captureChapterSchema>;
export type Capture = z.infer<typeof captureSchema>;
