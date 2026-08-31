import { z } from "zod";

/**
 * Uninstall-reason keys (#104), aligned with the design mock. The form
 * renders them in this order; the column stores the selected subset.
 */
export const feedbackReasons = [
  "did-not-work",
  "too-slow",
  "better-alternative",
  "dont-need",
  "hard-to-use",
  "missing-feature",
  "other",
] as const;

const feedbackSchema = z.object({
  source: z.enum(["uninstall", "website"]).default("uninstall"),
  rating: z.number().int().min(1).max(5),
  reasons: z
    .array(z.enum(feedbackReasons))
    .max(feedbackReasons.length)
    .optional(),
  // Per-reason follow-up text, keyed by the reason it elaborates.
  details: z
    .partialRecord(z.enum(feedbackReasons), z.string().trim().max(2000))
    .optional(),
  contactEmail: z.email().max(320).optional().or(z.literal("")),
  extensionVersion: z.string().trim().max(32).optional(),
  // Honeypot: real users never render this field, so any non-empty value
  // marks a bot. Bounded so oversized payloads cannot skirt the body cap;
  // the route answers bots with fake success instead of a 4xx (#104).
  website: z.string().max(200).optional(),
});

export type FeedbackPayload = z.infer<typeof feedbackSchema>;

export function validateFeedbackPayload(payload: unknown) {
  const result = feedbackSchema.safeParse(payload);
  if (!result.success) return undefined;
  const details = result.data.details
    ? Object.fromEntries(
        Object.entries(result.data.details).filter(([, text]) => text !== ""),
      )
    : undefined;
  return {
    ...result.data,
    reasons: [...new Set(result.data.reasons ?? [])],
    details: details && Object.keys(details).length > 0 ? details : undefined,
    contactEmail: result.data.contactEmail || undefined,
    extensionVersion: result.data.extensionVersion || undefined,
  };
}
