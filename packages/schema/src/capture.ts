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
const MAX_INT4 = 2_147_483_647;
const YOUTUBE_CHANNEL_PATH =
  /^\/(?:@[^/]+|channel\/[^/]+|user\/[^/]+|c\/[^/]+)\/?$/;
const nonNegativeInt4 = z.number().int().min(0).max(MAX_INT4);

export const captureSourceSchema = z
  .strictObject({
    videoId: z
      .string()
      .regex(VIDEO_ID, "must be an 11-character YouTube video id"),
    url: z.url(),
    title: z.string().trim().min(1),
    channelName: z.string().trim().min(1),
    // The producer uses an empty string when YouTube exposes no channel URL.
    channelUrl: z.string(),
    description: z.string(),
    // YouTube emits both ISO dates and display dates such as "Oct 24, 2009".
    publishedAt: z.string().trim().min(1).optional(),
    durationSeconds: nonNegativeInt4.optional(),
  })
  .superRefine((source, context) => {
    try {
      const url = new URL(source.url);
      if (
        url.protocol !== "https:" ||
        url.hostname !== "www.youtube.com" ||
        url.pathname !== "/watch" ||
        url.searchParams.get("v") !== source.videoId ||
        [...url.searchParams.keys()].some((key) => key !== "v")
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

    if (source.channelUrl !== "") {
      try {
        const url = new URL(source.channelUrl);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "www.youtube.com" ||
          !YOUTUBE_CHANNEL_PATH.test(url.pathname) ||
          url.search ||
          url.hash
        ) {
          throw new Error("invalid channel URL");
        }
      } catch {
        context.addIssue({
          code: "custom",
          path: ["channelUrl"],
          message: "must be an HTTPS YouTube channel URL or empty",
        });
      }
    }
  });

export const captureSegmentSchema = z.strictObject({
  /** Non-negative integer seconds within PostgreSQL's integer range. */
  start: nonNegativeInt4,
  text: z.string().min(1),
});

export const captureChapterSchema = z.strictObject({
  start: nonNegativeInt4,
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
