export interface SelectorRule {
  selector: string;
  attribute?: string;
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

export interface SiteSelectors {
  meta: {
    title: SelectorRule[];
    description: SelectorRule[];
    channelName: SelectorRule[];
    channelUrl: SelectorRule[];
    publishedAt?: SelectorRule[];
    language?: SelectorRule[];
    duration?: SelectorRule[];
  };
  transcript: TranscriptSelectors;
  chapters?: ChapterMarkersSelectors;
}

export const youtubeSelectors: SiteSelectors = {
  meta: {
    // Live DOM first, head <meta>/<link> fallback. YouTube is an SPA: on
    // client-side navigation between videos it re-renders the page body but
    // never updates the server-rendered head tags, so meta tags go stale.
    title: [
      { selector: "h1.ytd-watch-metadata, ytd-watch-metadata h1" },
      {
        selector: 'meta[name="title"], meta[property="og:title"]',
        attribute: "content",
      },
    ],
    description: [
      { selector: "#attributed-snippet-text" },
      {
        selector: 'meta[name="description"], meta[property="og:description"]',
        attribute: "content",
      },
    ],
    channelName: [
      { selector: "#owner #channel-name a, ytd-channel-name a" },
      { selector: 'link[itemprop="name"]', attribute: "content" },
    ],
    channelUrl: [
      {
        selector: "#owner #channel-name a, ytd-channel-name a",
        attribute: "href",
      },
      { selector: 'link[itemprop="url"]', attribute: "href" },
    ],
    publishedAt: [
      { selector: "#info-strings yt-formatted-string" },
      {
        selector: 'meta[itemprop="datePublished"]',
        attribute: "content",
      },
    ],
    language: [
      {
        selector: 'meta[itemprop="inLanguage"], meta[name="inLanguage"]',
        attribute: "content",
      },
    ],
    duration: [
      { selector: ".ytp-time-duration" },
      { selector: 'meta[itemprop="duration"]', attribute: "content" },
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
