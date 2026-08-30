import { Fragment, type ReactNode } from "react";

/**
 * Shared search-term highlighting for the public archive: query words are
 * marked wherever they appear, so the same component serves the results list
 * and the detail-page reader.
 */

/** Splits a normalized query into the whitespace-separated terms to mark. */
export function queryTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds one case-insensitive alternation of the terms, or `null` when there
 * is nothing to mark (callers then render plain text). Full-text search
 * matches words independently, so each term is marked on its own.
 */
export function buildTermPattern(terms: string[]): RegExp | null {
  if (terms.length === 0) return null;
  // Deliberately non-global: `split` finds every occurrence without it, and
  // callers can `test` the pattern without lastIndex state leaking.
  return new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "iu");
}

/**
 * Renders `text` with every term occurrence wrapped in a `<mark>`. The single
 * capture group puts matched substrings at odd split indices.
 */
export function Highlight({
  text,
  pattern,
}: {
  text: string;
  pattern: RegExp | null;
}) {
  if (pattern === null) return <>{text}</>;
  const parts = text.split(pattern);
  const nodes: ReactNode[] = parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark
        className="rounded-[3px] bg-[#edf7ff] px-0.5 font-semibold text-inherit"
        // biome-ignore lint/suspicious/noArrayIndexKey: split parts are positional and never reordered.
        key={`${index}-${part}`}
      >
        {part}
      </mark>
    ) : part === "" ? null : (
      // biome-ignore lint/suspicious/noArrayIndexKey: split parts are positional and never reordered.
      <Fragment key={`${index}-${part}`}>{part}</Fragment>
    ),
  );
  return <>{nodes}</>;
}
