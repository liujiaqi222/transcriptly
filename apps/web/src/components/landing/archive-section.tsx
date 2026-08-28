import type { PublicTranscriptSummary } from "@/lib/publications/queries";
import type { SearchResult } from "@/lib/search/search";
import { CHROME_INSTALL_URL, eyebrow, focusRing } from "./shared";

export function ArchiveSection({
  query,
  publicItems,
  search,
}: {
  query: string;
  publicItems: PublicTranscriptSummary[];
  search: SearchResult | null;
}) {
  return (
    <section
      className="border-y border-[#e2e8f0] bg-white px-[max(24px,calc((100%-1200px)/2))] py-28 max-sm:py-20"
      id="archive"
      aria-labelledby="archive-title"
    >
      <div className="mb-12 max-w-215">
        <p className={eyebrow}>03 · Public archive</p>
        <h2
          className="m-0 text-[clamp(38px,5vw,64px)] leading-[1.02] font-bold tracking-[-0.04em] text-balance"
          id="archive-title"
        >
          Search transcripts on the web.
        </h2>
        <p className="mt-4 mb-0 text-sm font-bold text-[#0872b9]">
          Search · Read · Jump back to YouTube
        </p>
      </div>
      <form className="max-w-190" action="/#archive" method="get">
        <label className="mb-2 block text-sm font-bold" htmlFor="archive-query">
          Search the public archive
        </label>
        <div className="flex gap-2 max-sm:flex-col">
          <input
            className={`min-h-13 min-w-0 flex-1 rounded-xl border border-slate-400 bg-white px-4 py-3 text-[#202124] placeholder:text-[#64748b] ${focusRing}`}
            id="archive-query"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search words, names, or topics"
          />
          <button
            className={`min-h-13 rounded-xl border-0 bg-[#202124] px-5 py-3 font-bold text-white ${focusRing}`}
            type="submit"
          >
            Search
          </button>
        </div>
      </form>
      {query && search ? (
        <div className="mt-12" aria-live="polite">
          <div className="flex items-baseline justify-between gap-6">
            <h3 className="m-0 text-2xl font-bold">Results for “{query}”</h3>
            <a
              className={`font-bold text-[#0872b9] underline-offset-4 ${focusRing}`}
              href="/#archive"
            >
              Clear search
            </a>
          </div>
          {search.hits.length === 0 ? (
            <p className="mt-8 text-[#64748b]">
              No public transcript matches this search.
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {search.hits.map((hit) => (
                <li className="border-t border-[#e2e8f0]" key={hit.key}>
                  <a
                    className={`grid grid-cols-[minmax(0,1fr)_180px] gap-x-6 gap-y-2 py-5 no-underline max-sm:grid-cols-1 ${focusRing}`}
                    href={`/videos/${hit.videoId}`}
                  >
                    <strong className="text-lg">{hit.title}</strong>
                    <span className="text-right text-sm font-bold text-[#0872b9] max-sm:text-left">
                      {hit.channelName}
                    </span>
                    <p className="col-span-full m-0 leading-relaxed text-[#64748b]">
                      {hit.window.find((segment) => segment.isHit)?.text}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : publicItems.length > 0 ? (
        <div className="mt-12 grid grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] gap-12 max-sm:grid-cols-1 max-sm:gap-6">
          <ul className="m-0 list-none p-0">
            {publicItems.map((item) => (
              <li className="border-t border-[#e2e8f0]" key={item.videoId}>
                <a
                  className={`grid gap-1.5 py-5 no-underline hover:text-[#0872b9] ${focusRing}`}
                  href={`/videos/${item.videoId}`}
                >
                  <span className="text-xs font-bold text-[#0872b9]">
                    {item.channelName}
                  </span>
                  <strong className="text-lg">{item.title}</strong>
                  <small className="text-[#64748b]">
                    {item.segmentCount} transcript segments
                  </small>
                </a>
              </li>
            ))}
          </ul>
          <div className="self-start rounded-2xl border border-[#e2e8f0] bg-[#fffdf8] p-8">
            <span className="text-xs font-bold text-[#0872b9]">
              Public transcript
            </span>
            <h3 className="my-3 text-3xl leading-tight font-bold tracking-[-0.03em]">
              {publicItems[0]?.title}
            </h3>
            <p className="leading-[1.65] text-[#64748b]">
              Open the complete server-rendered timeline, then use any timestamp
              to return to the exact moment on YouTube.
            </p>
            <a
              className={`font-bold text-[#0872b9] ${focusRing}`}
              href={`/videos/${publicItems[0]?.videoId}`}
            >
              Read transcript →
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-8 max-w-190 rounded-2xl border border-[#e2e8f0] bg-[#fffdf8] p-8 text-[#64748b]">
          <strong className="text-[#202124]">
            The public archive is waiting for its first transcript.
          </strong>
          <p className="mb-0 leading-relaxed">
            Search and reading appear here only after a signed-in user makes an
            explicit, complete public contribution.
          </p>
        </div>
      )}
      <p className="mt-10 mb-0 text-sm text-[#64748b]">
        Missing one? Contribute it to the public archive with Transcriptly.
        <a
          className={`font-bold text-[#0872b9] ${focusRing}`}
          href={CHROME_INSTALL_URL}
          rel="noreferrer"
          target="_blank"
        >
          {" "}
          Install the extension →
        </a>
      </p>
    </section>
  );
}
