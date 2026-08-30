/**
 * Server-side numbered pagination for the public list pages (#96). Invalid
 * pages are 404ed by the caller; this component only renders links.
 */
export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex items-center justify-between gap-6 border-t border-[#e2e8f0] pt-6"
    >
      {page > 1 ? (
        <a
          className="text-sm font-bold text-[#0872b9] underline-offset-4 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
          href={hrefFor(page - 1)}
        >
          {page === 2 ? "Newer transcripts" : `Page ${page - 1}`}
        </a>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="font-mono text-sm text-[#64748b] tabular-nums">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <a
          className="text-sm font-bold text-[#0872b9] underline-offset-4 focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
          href={hrefFor(page + 1)}
        >
          {page === 1 ? "Older transcripts" : `Page ${page + 1}`}
        </a>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
