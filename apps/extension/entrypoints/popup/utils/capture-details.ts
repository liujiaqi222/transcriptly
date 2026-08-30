import {
  canonicalWatchUrl,
  channelUrlFromHandle,
  formatTimestamp,
} from "@transcriptly/capture";
import type { Capture } from "@transcriptly/schema";

export interface PropertyRow {
  label: string;
  value: string;
  href?: string;
}

export function formatCapturedAt(capturedAt: string): string {
  const date = new Date(capturedAt);
  if (Number.isNaN(date.getTime())) return capturedAt;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function propertyRows(capture: Capture): PropertyRow[] {
  const { source } = capture;
  const rows: PropertyRow[] = [
    { label: "Title", value: source.title },
    {
      label: "Channel",
      value: source.channelName,
      href: channelUrlFromHandle(source.channelHandle),
    },
    {
      label: "Video ID",
      value: source.videoId,
      href: canonicalWatchUrl(source.videoId),
    },
  ];

  if (source.publishedAt !== undefined) {
    rows.push({ label: "Published", value: source.publishedAt });
  }
  if (source.durationSeconds !== undefined) {
    rows.push({
      label: "Duration",
      value: formatTimestamp(source.durationSeconds),
    });
  }
  rows.push({
    label: "Captured",
    value: formatCapturedAt(capture.capturedAt),
  });

  return rows;
}
