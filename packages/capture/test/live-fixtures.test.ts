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
 * diagnosing #100 (variants A-C) and 2026-09-23 while diagnosing #127
 * (variant D). YouTube ships multiple watch variants at once (the same
 * batch run hit several of the below), so capture must extract the channel
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

interface LiveVariant {
  url: string;
  channelName: string;
  channelHandle: string;
  hasAvatar: boolean;
}

const variants: Record<string, LiveVariant> = {
  "watch-variant-a-json-element.html": {
    url: "https://www.youtube.com/watch?v=rKgtm81yi94",
    channelName: "TED",
    channelHandle: "/@TED",
    hasAvatar: true,
  },
  "watch-variant-b-dialog-id-form.html": {
    url: "https://www.youtube.com/watch?v=wqbFUpnZTDA",
    channelName: "TED",
    channelHandle: "/@TED",
    // The thumbnail came back empty in the raw page data.
    hasAvatar: false,
  },
  "watch-variant-c-title-runs-only.html": {
    url: "https://www.youtube.com/watch?v=sb34MfJjurc",
    channelName: "TED",
    channelHandle: "/@TED",
    hasAvatar: true,
  },
  // Captured 2026-09-23 for #127: the owner renderer carries no title runs
  // and no thumbnail; the name lives in `attributedTitle`/share dialog and
  // the handle is an ID-form browseEndpoint. Also the first variant whose
  // ytInitialData `currentVideoEndpoint` gate must accept (same video as
  // the capture URL).
  "watch-variant-d-collab-owner.html": {
    url: "https://www.youtube.com/watch?v=vMyiySyx0AU",
    channelName: "Big Think Clips",
    channelHandle: "/@bigthinkclips",
    hasAvatar: false,
  },
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
    url: variants[name].url,
  }).window.document;
}

describe("capture against live YouTube watch variants", () => {
  it.each(Object.keys(variants))(
    "%s extracts the variant's channel identity with the schema satisfied",
    async (name) => {
      const variant = variants[name];
      const result = await capture(loadLiveDocument(name), variant.url, {
        selectors: liveSelectors,
        timeoutMs: 500,
      });

      expect(result.source.videoId).toBe(variant.url.split("v=")[1]);
      expect(result.source.channelName).toBe(variant.channelName);
      expect(result.source.channelHandle).toBe(variant.channelHandle);
      // An avatar is expected only when the variant carries one.
      if (variant.hasAvatar) {
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
