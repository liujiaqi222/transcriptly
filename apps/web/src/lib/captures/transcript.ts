/** Mirrors the extension's Markdown serialization: timestamps (M:SS /
 *  H:MM:SS), the interleaved Timeline blocks and the reflowed Article
 *  blocks. */
export function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Standard YouTube deep link to a position, in whole seconds. */
export function timestampUrl(sourceUrl: string, seconds: number): string {
  return `${sourceUrl}&t=${seconds}s`;
}

export type TranscriptBlock =
  | { kind: "chapter"; title: string }
  | { kind: "segment"; start: number; text: string };

export type TranscriptTimeline = {
  segments: { start: number; text: string }[];
  chapters: { start: number; title: string }[];
};

/**
 * Interleaves ordered Chapters before the first Segment at or after their
 * start time; trailing chapters after the last Segment are dropped. Same
 * rule as the extension's Markdown serialization.
 */
export function transcriptBlocks({
  segments,
  chapters,
}: TranscriptTimeline): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  let chapterIndex = 0;

  for (const segment of segments) {
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

const ARTICLE_SOFT_TEXT_LENGTH = 240;
const ARTICLE_MAX_TEXT_LENGTH = 600;
const ARTICLE_MAX_TIME_SPAN_SECONDS = 60;
const SENTENCE_BOUNDARY =
  /(?:[.!?][\]）)」』】〉》”’"']*(?=\s|$)|[。！？][\]）)」』】〉》”’"']*)/gu;
const CJK_CHARACTER =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

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
 * captions. Same rules as the extension's Article Markdown format.
 */
export function articleBlocks(timeline: TranscriptTimeline): ArticleBlock[] {
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

  for (const block of transcriptBlocks(timeline)) {
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
