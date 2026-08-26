import type { MarkdownFormat } from "@transcriptly/capture";

export const MARKDOWN_FORMAT_PREFERENCE_KEY = "local-markdown-format";
export const DEFAULT_MARKDOWN_FORMAT: MarkdownFormat = "timeline";

export function normalizeMarkdownFormat(value: unknown): MarkdownFormat {
  return value === "article" ? "article" : DEFAULT_MARKDOWN_FORMAT;
}
