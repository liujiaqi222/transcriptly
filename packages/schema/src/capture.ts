export interface CaptureSource {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  channelUrl: string;
  description: string;
  publishedAt?: string;
  language?: string;
  durationSeconds?: number;
}

export interface CaptureSegment {
  start: number;
  text: string;
}

export interface CaptureChapter {
  start: number;
  title: string;
}

export interface Capture {
  source: CaptureSource;
  capturedAt: string;
  segments: CaptureSegment[];
  chapters?: CaptureChapter[];
}
