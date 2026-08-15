import type { Capture, CaptureSource } from "@transcriptly/schema";

function escapeInline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/~/g, "\\~")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function timestampUrl(url: string, seconds: number): string {
  return `${url}&t=${seconds}`;
}

function buildFrontmatter(source: CaptureSource, capturedAt: string): string {
  const lines = [
    "---",
    `title: ${yamlString(source.title)}`,
    `channelName: ${yamlString(source.channelName)}`,
    `channelUrl: ${yamlString(source.channelUrl)}`,
    `url: ${yamlString(source.url)}`,
    `videoId: ${yamlString(source.videoId)}`,
  ];
  if (source.publishedAt !== undefined) {
    lines.push(`publishedAt: ${yamlString(source.publishedAt)}`);
  }
  if (source.language !== undefined) {
    lines.push(`language: ${yamlString(source.language)}`);
  }
  if (source.durationSeconds !== undefined) {
    lines.push(`durationSeconds: ${source.durationSeconds}`);
  }
  lines.push(`capturedAt: ${yamlString(capturedAt)}`);
  lines.push("---");
  return lines.join("\n");
}

export function serializeToMarkdown(capture: Capture): string {
  const { source, capturedAt, segments } = capture;

  const parts: string[] = [
    buildFrontmatter(source, capturedAt),
    "",
    `# ${escapeInline(source.title)}`,
    "",
    `**Source:** [${escapeInline(source.title)}](${source.url}) — ${escapeInline(source.channelName)}`,
    "",
  ];

  if (source.description.trim().length > 0) {
    parts.push(
      source.description
        .split("\n")
        .map((line) => `> ${escapeInline(line)}`)
        .join("\n"),
      "",
    );
  }

  parts.push("## Transcript", "");

  if (segments.length > 0) {
    const chapters = capture.chapters ?? [];
    const lines: string[] = [];
    let chapterIndex = 0;

    for (const segment of segments) {
      while (chapterIndex < chapters.length) {
        const chapter = chapters[chapterIndex];
        if (chapter === undefined || chapter.start > segment.start) break;
        lines.push(`### ${escapeInline(chapter.title)}`, "");
        chapterIndex++;
      }
      lines.push(
        `- [${formatTimestamp(segment.start)}](${timestampUrl(source.url, segment.start)}) ${escapeInline(segment.text)}`,
      );
    }

    parts.push(lines.join("\n"), "");
  }

  return parts.join("\n");
}
