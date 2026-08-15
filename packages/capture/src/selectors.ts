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
}

export interface SiteSelectors {
  meta: {
    title: SelectorRule;
    description: SelectorRule;
    channelName: SelectorRule;
    channelUrl: SelectorRule;
    publishedAt?: SelectorRule;
    language?: SelectorRule;
    duration?: SelectorRule;
  };
  transcript: TranscriptSelectors;
}

export const youtubeSelectors: SiteSelectors = {
  meta: {
    title: {
      selector: 'meta[name="title"], meta[property="og:title"]',
      attribute: "content",
    },
    description: {
      selector: 'meta[name="description"], meta[property="og:description"]',
      attribute: "content",
    },
    channelName: {
      selector: 'link[itemprop="name"]',
      attribute: "content",
    },
    channelUrl: {
      selector: 'link[itemprop="url"]',
      attribute: "href",
    },
    publishedAt: {
      selector: 'meta[itemprop="datePublished"]',
      attribute: "content",
    },
    language: {
      selector: 'meta[itemprop="inLanguage"], meta[name="inLanguage"]',
      attribute: "content",
    },
    duration: {
      selector: 'meta[itemprop="duration"]',
      attribute: "content",
    },
  },
  transcript: {
    section: "ytd-video-description-transcript-section-renderer",
    openButton: "button",
    segmentsContainer:
      "ytd-transcript-renderer #segments-container, #segments-container",
    segment: "ytd-transcript-segment-renderer",
    segmentTimestamp: ".segment-timestamp",
    segmentText: ".segment-text",
  },
};
