export interface SelectorRule {
  selector: string;
  attribute?: string;
  /**
   * `"head"` marks rules that read the document head. YouTube re-renders
   * the body on SPA navigation without touching the head, so head rules
   * are only consulted when the head provably describes the requested
   * video (its own canonical/og:url videoId matches) — otherwise they
   * would resurface the previously-opened video's metadata.
   */
  scope?: "head";
}

export interface TranscriptSelectors {
  section: string;
  openButton: string;
  segmentsContainer: string;
  segment: string;
  segmentTimestamp: string;
  segmentText: string;
  chapter: string;
  chapterText: string;
}

export interface ChapterMarkersSelectors {
  panel: string;
  item: string;
  itemTitle: string;
  itemTime: string;
}

const YOUTUBE_CHANNEL_LINK_SELECTOR =
  "#owner #channel-name a, ytd-channel-name a";

export interface SiteSelectors {
  meta: {
    title: SelectorRule[];
    description: SelectorRule[];
    channelName: SelectorRule[];
    channelUrl: SelectorRule[];
    channelAvatar?: SelectorRule[];
    publishedAt?: SelectorRule[];
    duration?: SelectorRule[];
  };
  transcript: TranscriptSelectors;
  chapters?: ChapterMarkersSelectors;
}

export const youtubeSelectors: SiteSelectors = {
  meta: {
    // Prefer live page elements; fall back to server-rendered head elements
    // only when the head provably describes this video (see
    // SelectorRule.scope). YouTube SPA navigation re-renders the body
    // without updating the head.
    title: [
      { selector: "h1.ytd-watch-metadata, ytd-watch-metadata h1" },
      {
        selector: 'meta[name="title"], meta[property="og:title"]',
        attribute: "content",
        scope: "head",
      },
    ],
    description: [
      { selector: "#attributed-snippet-text" },
      {
        selector: 'meta[name="description"], meta[property="og:description"]',
        attribute: "content",
        scope: "head",
      },
    ],
    channelName: [
      // Joint channels may expose a text-only attributed link without href.
      { selector: "#attributed-channel-name a" },
      { selector: YOUTUBE_CHANNEL_LINK_SELECTOR },
      {
        selector: 'link[itemprop="name"]',
        attribute: "content",
        scope: "head",
      },
    ],
    channelUrl: [
      { selector: YOUTUBE_CHANNEL_LINK_SELECTOR, attribute: "href" },
      {
        selector: 'link[itemprop="url"]',
        attribute: "href",
        scope: "head",
      },
    ],
    channelAvatar: [
      // Current view model: the owner renders its avatar(s) as
      // avatar-view-model > yt-avatar-shape > img (no #avatar wrapper).
      {
        selector: "ytd-video-owner-renderer avatar-view-model img",
        attribute: "src",
      },
      { selector: "#owner avatar-view-model img", attribute: "src" },
      // Older layouts wrapped the avatar in an #avatar element.
      { selector: "ytd-video-owner-renderer #avatar img", attribute: "src" },
      { selector: "#owner #avatar img", attribute: "src" },
    ],
    publishedAt: [
      { selector: "#info-strings yt-formatted-string" },
      {
        selector: 'meta[itemprop="datePublished"]',
        attribute: "content",
        scope: "head",
      },
    ],
    duration: [
      { selector: ".ytp-time-duration" },
      {
        selector: 'meta[itemprop="duration"]',
        attribute: "content",
        scope: "head",
      },
    ],
  },
  transcript: {
    section: "ytd-video-description-transcript-section-renderer",
    openButton: "button",
    segmentsContainer:
      'ytd-transcript-renderer #segments-container, ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"] #contents, #segments-container',
    segment: "ytd-transcript-segment-renderer, transcript-segment-view-model",
    segmentTimestamp:
      ".segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp",
    segmentText: ".segment-text, [role='text']",
    chapter: "ytd-transcript-section-header-renderer",
    chapterText: "yt-formatted-string",
  },
  chapters: {
    panel:
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"]',
    item: "ytd-macro-markers-list-item-renderer",
    itemTitle: "h3.macro-markers",
    itemTime: "#time",
  },
};
