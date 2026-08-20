import { createHash } from "node:crypto";
import type { Capture } from "@transcriptly/schema";

/**
 * Hash only the ordered transcript body. Source metadata and capture time are
 * deliberately excluded so identical transcript bodies can be shared.
 */
export function transcriptContentHash(capture: Capture): string {
  const body = JSON.stringify({
    segments: capture.segments,
    chapters: capture.chapters ?? [],
  });
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function transcriptBody(capture: Capture) {
  return {
    segments: capture.segments,
    chapters: capture.chapters ?? [],
  };
}
