import type { PublicTranscriptSummary } from "@/lib/publications/queries";
import {
  CHROME_INSTALL_URL,
  displayFace,
  focusRing,
  SectionKicker,
} from "./shared";

export function ArchiveSection({
  publicItems,
}: {
  publicItems: PublicTranscriptSummary[];
}) {
  return (
    <section
      className="border-y border-[#e2e8f0] bg-white px-[max(24px,calc((100%-1200px)/2))] py-16 max-sm:py-12"
      id="archive"
      aria-labelledby="archive-title"
    >
      <div className="mx-auto w-[min(1200px,calc(100%-48px))] max-sm:w-[calc(100%-32px)]">
        <div className="mb-8 max-w-190">
          <SectionKicker index="04" label="Public archive" />
          <h2
            className={`${displayFace} m-0 text-[clamp(30px,3.8vw,44px)] leading-[1.05]`}
            id="archive-title"
          >
            Share what you <em className="italic">choose to share.</em>
          </h2>
          <p className="mt-4 mb-0 max-w-[56ch] text-base leading-[1.6] text-[#64748b]">
            Contributing is optional - everything local stays local until you
            explicitly publish a transcript. When you do, it becomes searchable
            in the public archive.
          </p>
        </div>

        <search className="max-w-190" aria-label="Search the public archive">
          <form action="/transcripts" method="get">
            <label
              className="mb-2 block text-sm font-bold"
              htmlFor="archive-query"
            >
              Search the public archive
            </label>
            <div className="flex gap-2 max-sm:flex-col">
              <input
                className={`min-h-13 min-w-0 flex-1 rounded-xl border border-slate-400 bg-white px-4 py-3 text-[#202124] placeholder:text-[#64748b] ${focusRing}`}
                id="archive-query"
                name="q"
                type="search"
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
        </search>

        {publicItems.length > 0 ? (
          <>
            <ul className="mt-8 m-0 list-none p-0">
              {publicItems.map((item) => (
                <li className="border-t border-[#e2e8f0]" key={item.videoId}>
                  <a
                    className={`grid gap-1 py-4 no-underline hover:text-[#0872b9] ${focusRing}`}
                    href={`/transcripts/${item.videoId}`}
                  >
                    <span className="font-mono text-xs font-medium text-[#0872b9]">
                      {item.channelName}
                    </span>
                    <strong className="text-base">{item.title}</strong>
                    <small className="font-mono text-xs text-[#64748b]">
                      {item.publicationUpdatedAt.toISOString().slice(0, 10)}
                    </small>
                  </a>
                </li>
              ))}
            </ul>
            <a
              className={`mt-6 inline-block font-bold text-[#0872b9] ${focusRing}`}
              href="/transcripts"
            >
              {"View all transcripts ->"}
            </a>
          </>
        ) : (
          <div className="mt-8 max-w-190 rounded-2xl border border-[#e2e8f0] bg-[#f7f4ec] p-8 text-[#64748b]">
            <strong className="text-[#202124]">
              The public archive is waiting for its first transcript.
            </strong>
            <p className="mb-0 leading-relaxed">
              Search and reading appear here only after a signed-in user makes
              an explicit, complete public contribution.
            </p>
          </div>
        )}

        <p className="mt-8 mb-0 text-sm text-[#64748b]">
          Missing one? Contribute it to the public archive with Transcriptly.
          <a
            className={`font-bold text-[#0872b9] ${focusRing}`}
            href={CHROME_INSTALL_URL}
            rel="noreferrer"
            target="_blank"
          >
            {" "}
            {"Install the extension ->"}
          </a>
        </p>
      </div>
    </section>
  );
}
