import type { Capture, CaptureSource } from "@transcriptly/schema";

export type MarkdownFormat = "timeline" | "article";

const ARTICLE_SOFT_TEXT_LENGTH = 240;
const ARTICLE_MAX_TEXT_LENGTH = 600;
const ARTICLE_MAX_TIME_SPAN_SECONDS = 60;
const SENTENCE_BOUNDARY =
  /(?:[.!?][\]）)」』】〉》”’"']*(?=\s|$)|[。！？][\]）)」』】〉》”’"']*)/gu;
const CJK_CHARACTER =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

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

/** Rebuilds the public YouTube channel URL from the captured handle. */
export function channelUrlFromHandle(handle: string): string {
  if (handle === "") return "";
  return `https://www.youtube.com${handle.startsWith("/") ? handle : `/${handle}`}`;
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
  return `${url}&t=${seconds}s`;
}

function buildFrontmatter(source: CaptureSource, capturedAt: string): string {
  const lines = [
    "---",
    `title: ${yamlString(source.title)}`,
    `channelName: ${yamlString(source.channelName)}`,
    `channelUrl: ${yamlString(channelUrlFromHandle(source.channelHandle))}`,
    `url: ${yamlString(source.url)}`,
    `videoId: ${yamlString(source.videoId)}`,
  ];
  if (source.channelAvatarUrl !== undefined) {
    lines.push(`channelAvatarUrl: ${yamlString(source.channelAvatarUrl)}`);
  }
  if (source.publishedAt !== undefined) {
    lines.push(`publishedAt: ${yamlString(source.publishedAt)}`);
  }
  if (source.durationSeconds !== undefined) {
    lines.push(`durationSeconds: ${source.durationSeconds}`);
  }
  lines.push(`capturedAt: ${yamlString(capturedAt)}`);
  lines.push("---");
  return lines.join("\n");
}

export type TranscriptBlock =
  | { kind: "chapter"; title: string }
  | { kind: "segment"; start: number; text: string };

export function transcriptBlocks(capture: Capture): TranscriptBlock[] {
  const chapters = capture.chapters ?? [];
  const blocks: TranscriptBlock[] = [];
  let chapterIndex = 0;

  for (const segment of capture.segments) {
    while (chapterIndex < chapters.length) {
      const chapter = chapters[chapterIndex];
      if (chapter === undefined || chapter.start > segment.start) break;
      blocks.push({ kind: "chapter", title: chapter.title });
      chapterIndex += 1;
    }
    blocks.push({ kind: "segment", start: segment.start, text: segment.text });
  }

  return blocks;
}

export interface ArticleParagraph {
  start: number;
  text: string;
}

export type ArticleBlock =
  | { kind: "chapter"; title: string }
  | { kind: "paragraph"; start: number; text: string };

interface ArticleTextUnit {
  start: number;
  text: string;
  endsSentence: boolean;
}

function joinSegmentText(left: string, right: string): string {
  if (/\s$/u.test(left) || /^\s/u.test(right)) return `${left}${right}`;
  const leftCharacter = left.at(-1) ?? "";
  const rightCharacter = right.at(0) ?? "";
  const separator =
    CJK_CHARACTER.test(leftCharacter) && CJK_CHARACTER.test(rightCharacter)
      ? ""
      : " ";
  return `${left}${separator}${right}`;
}

function articleTextUnits(start: number, text: string): ArticleTextUnit[] {
  const units: ArticleTextUnit[] = [];
  let cursor = 0;

  for (const match of text.matchAll(SENTENCE_BOUNDARY)) {
    const boundaryEnd = (match.index ?? 0) + match[0].length;
    const sentence = text.slice(cursor, boundaryEnd).trim();
    if (sentence.length > 0) {
      units.push({ start, text: sentence, endsSentence: true });
    }
    cursor = boundaryEnd;
  }

  const remainder = text.slice(cursor).trim();
  if (remainder.length > 0) {
    units.push({ start, text: remainder, endsSentence: false });
  }
  return units;
}

function joinedArticleText(units: ArticleTextUnit[]): string {
  return units.reduce(
    (text, unit) =>
      text.length === 0 ? unit.text : joinSegmentText(text, unit.text),
    "",
  );
}

/**
 * Reflows ordered caption segments without rewriting their text. Chapters are
 * hard boundaries; punctuation is a preferred soft boundary; text length and
 * elapsed video time are deterministic hard boundaries for punctuation-poor
 * captions.
 */
export function articleBlocks(capture: Capture): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const paragraphUnits: ArticleTextUnit[] = [];

  const flush = (count = paragraphUnits.length) => {
    const flushed = paragraphUnits.splice(0, count);
    const first = flushed[0];
    if (!first) return;
    blocks.push({
      kind: "paragraph",
      start: first.start,
      text: joinedArticleText(flushed),
    });
  };

  for (const block of transcriptBlocks(capture)) {
    if (block.kind === "chapter") {
      flush();
      blocks.push(block);
      continue;
    }

    for (const unit of articleTextUnits(block.start, block.text)) {
      while (paragraphUnits.length > 0) {
        const first = paragraphUnits[0];
        if (!first) break;
        const combined = joinSegmentText(
          joinedArticleText(paragraphUnits),
          unit.text,
        );
        const exceedsTextLimit = combined.length > ARTICLE_MAX_TEXT_LENGTH;
        const exceedsTimeLimit =
          unit.start - first.start > ARTICLE_MAX_TIME_SPAN_SECONDS;
        if (!exceedsTextLimit && !exceedsTimeLimit) break;

        let safeBoundary = -1;
        for (let index = paragraphUnits.length - 1; index >= 0; index -= 1) {
          const candidate = paragraphUnits[index];
          if (
            candidate?.endsSentence &&
            joinedArticleText(paragraphUnits.slice(0, index + 1)).length >=
              ARTICLE_SOFT_TEXT_LENGTH
          ) {
            safeBoundary = index;
            break;
          }
        }
        flush(safeBoundary >= 0 ? safeBoundary + 1 : paragraphUnits.length);
      }

      paragraphUnits.push(unit);
      if (
        unit.endsSentence &&
        joinedArticleText(paragraphUnits).length >= ARTICLE_SOFT_TEXT_LENGTH
      ) {
        flush();
      }
    }
  }

  flush();
  return blocks;
}

export function serializeToMarkdown(
  capture: Capture,
  format: MarkdownFormat = "timeline",
): string {
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
    const lines: string[] = [];

    const blocks =
      format === "article" ? articleBlocks(capture) : transcriptBlocks(capture);
    for (const block of blocks) {
      if (block.kind === "chapter") {
        lines.push(`### ${escapeInline(block.title)}`, "");
      } else if (block.kind === "paragraph") {
        lines.push(
          `[${formatTimestamp(block.start)}](${timestampUrl(source.url, block.start)}) ${escapeInline(block.text)}`,
          "",
        );
      } else {
        lines.push(
          `- [${formatTimestamp(block.start)}](${timestampUrl(source.url, block.start)}) ${escapeInline(block.text)}`,
        );
      }
    }

    parts.push(lines.join("\n"), "");
  }

  return parts.join("\n");
}
