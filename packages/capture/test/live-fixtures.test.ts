// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureSchema } from "@transcriptly/schema";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { capture, youtubeSelectors } from "../src/index";
import type { SiteSelectors } from "../src/selectors";

/**
 * Live-page fixtures: real YouTube watch HTML captured 2026-08-30 while
 * diagnosing #100. YouTube ships multiple watch variants at once (the same
 * batch run hit all three below), so capture must extract the same channel
 * identity from each.
 *
 * Adding a fixture: when a capture incident suggests a new page shape,
 * fetch the real page (curl with a browser User-Agent), strip personal
 * data (visitorData), and drop it here with a name describing the
 * distinguishing feature. The fake transcript panel is injected at the end
 * of the body so `capture` passes the transcript stage; only the source
 * extraction is under test.
 *
 * These files are large (~1.3 MB) single-line blobs: keep assertions in
 * this file minimal and structural, not content-dependent beyond the
 * channel identity the variant is named for.
 */

const liveDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/live");

const videoUrls: Record<string, string> = {
  "watch-variant-a-json-element.html":
    "https://www.youtube.com/watch?v=rKgtm81yi94",
  "watch-variant-b-dialog-id-form.html":
    "https://www.youtube.com/watch?v=wqbFUpnZTDA",
  "watch-variant-c-title-runs-only.html":
    "https://www.youtube.com/watch?v=sb34MfJjurc",
};

/** Narrow the transcript selectors to the injected panel. */
const liveSelectors: SiteSelectors = {
  ...youtubeSelectors,
  transcript: {
    ...youtubeSelectors.transcript,
    segmentsContainer: "ytd-transcript-renderer #segments-container",
  },
};

function loadLiveDocument(name: string): Document {
  return new JSDOM(readFileSync(join(liveDir, name), "utf8"), {
    url: videoUrls[name],
  }).window.document;
}

describe("capture against live YouTube watch variants", () => {
  it.each(Object.keys(videoUrls))(
    "%s yields TED as /@TED with the schema satisfied",
    async (name) => {
      const result = await capture(loadLiveDocument(name), videoUrls[name], {
        selectors: liveSelectors,
        timeoutMs: 500,
      });

      // All three variants must agree on the channel identity (#100).
      expect(result.source.channelName).toBe("TED");
      expect(result.source.channelHandle).toBe("/@TED");
      // Variant B's thumbnail came back empty in the raw page data; an
      // avatar is expected only when the variant carries one.
      if (name !== "watch-variant-b-dialog-id-form.html") {
        expect(result.source.channelAvatarUrl).toBeDefined();
      }
      expect(captureSchema.safeParse(result).success).toBe(true);
      // The injected panel's segments survive the live page's noise.
      expect(result.segments).toEqual([
        { start: 0, text: "first live segment" },
        { start: 8, text: "second live segment" },
      ]);
    },
  );
});
