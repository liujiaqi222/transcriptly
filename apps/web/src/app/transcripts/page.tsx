import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getDatabase } from "@/db/client";
import { formatTimestamp } from "@/lib/captures/transcript";
import { listChannels } from "@/lib/channels/queries";
import { parsePageParam } from "@/lib/pagination";
import {
  countPublicTranscripts,
  listPublicTranscripts,
  TRANSCRIPT_PAGE_SIZE,
} from "@/lib/publications/queries";
import { normalizeQuery, searchPublicArchive } from "@/lib/search/search";
import { Pagination } from "./components/pagination";
import { TranscriptListItem } from "./components/transcript-list-item";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public transcripts - Transcriptly",
  description:
    "Browse every public transcript in the Transcriptly archive by recency, channel, or full-text search.",
  alternates: { canonical: "/transcripts" },
  openGraph: {
    title: "Public transcripts - Transcriptly",
    description:
      "Browse every public transcript in the Transcriptly archive by recency, channel, or full-text search.",
    type: "website",
    url: "/transcripts",
  },
};

const SEARCH_SCOPES = [
  { value: "text", label: "Transcript text" },
  { value: "videos", label: "Titles & channels" },
] as const;

type SearchScope = (typeof SEARCH_SCOPES)[number]["value"];

function transcriptHref(params: { q?: string; scope?: string; page: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.q && params.scope) search.set("scope", params.scope);
  if (params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/transcripts?${query}` : "/transcripts";
}

export default async function TranscriptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; scope?: string; page?: string }>;
}) {
  const { q, scope, page: rawPage } = await searchParams;
  const query = normalizeQuery(q ?? "") ?? "";
  const searchScope: SearchScope = scope === "videos" ? "videos" : "text";
  const page = parsePageParam(rawPage);
  if (page === null) notFound();

  const db = getDatabase();
  const querying = query !== "";
  const searchingText = querying && searchScope === "text";
  const searchingVideos = querying && searchScope === "videos";

  const [total, search, channels] = await Promise.all([
    searchingText
      ? Promise.resolve(0)
      : countPublicTranscripts(db, searchingVideos ? query : undefined),
    searchingText ? searchPublicArchive(db, query) : Promise.resolve(null),
    querying ? Promise.resolve([]) : listChannels(db),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / TRANSCRIPT_PAGE_SIZE));
  if (page > pageCount) notFound();
  const items = searchingText
    ? []
    : await listPublicTranscripts(
        db,
        page,
        searchingVideos ? query : undefined,
      );

  return (
    <main className="min-h-screen bg-[#fffdf8] font-sans text-[#202124]">
      <SiteHeader />
      <div className="mx-auto w-[min(920px,calc(100%-48px))] py-12 pb-24 max-sm:w-[calc(100%-32px)] max-sm:py-8">
        <h1 className="m-0 font-serif text-[clamp(32px,4vw,44px)] leading-[1.05] font-semibold tracking-[-0.03em]">
          Public transcripts
        </h1>

        <search className="mt-8" aria-label="Search public transcripts">
          <form action="/transcripts" method="get">
            <div className="flex gap-2 max-sm:flex-col">
              <input
                aria-label="Search public transcripts"
                className="min-h-13 min-w-0 flex-1 rounded-xl border border-slate-400 bg-white px-4 py-3 text-[#202124] placeholder:text-[#64748b] focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
                defaultValue={query}
                name="q"
                placeholder="Search words, names, or topics"
                type="search"
              />
              <button
                className="min-h-13 rounded-xl border-0 bg-[#202124] px-5 py-3 font-bold text-white focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
                type="submit"
              >
                Search
              </button>
            </div>
            <fieldset className="mt-3 flex items-center gap-1 border-0 p-0">
              <legend className="sr-only">Search scope</legend>
              {SEARCH_SCOPES.map(({ value, label }) => (
                <label
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold text-[#64748b] has-checked:bg-[#edf7ff] has-checked:text-[#0872b9]"
                  key={value}
                >
                  <input
                    defaultChecked={searchScope === value}
                    className="h-4 w-4 accent-[#1b90ed]"
                    name="scope"
                    type="radio"
                    value={value}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </form>
        </search>

        {querying ? null : channels.length > 0 ? (
          <nav
            aria-label="Browse by channel"
            className="mt-8 flex flex-wrap items-center gap-2 border-y border-[#e2e8f0] py-4"
          >
            <span className="mr-2 text-sm font-bold text-[#64748b]">
              Channels
            </span>
            {channels.slice(0, 8).map((channel) => (
              <Link
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-[#202124] no-underline hover:bg-[#edf7ff] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
                href={`/channels/${channel.slug}`}
                key={channel.id}
              >
                {channel.name}
                <span className="font-mono text-xs font-medium text-[#64748b] tabular-nums">
                  {channel.transcriptCount}
                </span>
              </Link>
            ))}
            <Link
              className="ml-auto text-sm font-bold text-[#0872b9] underline-offset-4 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
              href="/channels"
            >
              All channels →
            </Link>
          </nav>
        ) : null}

        {querying ? (
          searchScope === "text" ? (
            <div aria-live="polite" className="mt-10">
              <div className="flex items-baseline justify-between gap-6">
                <h2 className="m-0 text-xl font-bold">Results for “{query}”</h2>
                <Link
                  className="font-bold text-[#0872b9] underline-offset-4"
                  href="/transcripts"
                >
                  Clear search
                </Link>
              </div>
              {search === null || search.hits.length === 0 ? (
                <p className="mt-6 text-[#64748b]">
                  No public transcript matches this search.
                </p>
              ) : (
                <ul className="m-0 mt-2 list-none p-0">
                  {search.hits.map((hit) => (
                    <li className="border-t border-[#e2e8f0]" key={hit.key}>
                      <article className="grid grid-cols-[minmax(0,1fr)_180px] gap-x-6 gap-y-2 py-4 hover:bg-[#edf7ff] max-sm:grid-cols-1">
                        <Link
                          className="rounded-sm text-base font-bold text-[#202124] no-underline focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
                          href={`/transcripts/${hit.videoId}`}
                        >
                          {hit.title}
                        </Link>
                        <span className="text-right font-mono text-sm text-[#0872b9] max-sm:text-left">
                          {hit.channelName}
                        </span>
                        <a
                          className="col-span-full m-0 inline-block font-mono text-xs text-[#64748b] underline-offset-4"
                          href={`${hit.url}&t=${hit.hitStart}s`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {formatTimestamp(hit.hitStart)} · YouTube
                        </a>
                        <p className="col-span-full m-0 leading-relaxed text-[#64748b]">
                          {hit.window.find((segment) => segment.isHit)?.text}
                        </p>
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : total === 0 ? (
            <div aria-live="polite" className="mt-10">
              <div className="flex items-baseline justify-between gap-6">
                <h2 className="m-0 text-xl font-bold">
                  No videos match “{query}”
                </h2>
                <Link
                  className="font-bold text-[#0872b9] underline-offset-4"
                  href="/transcripts"
                >
                  Clear search
                </Link>
              </div>
            </div>
          ) : (
            <div aria-live="polite" className="mt-10">
              <div className="flex items-baseline justify-between gap-6">
                <h2 className="m-0 text-xl font-bold">
                  Videos matching “{query}”
                </h2>
                <Link
                  className="font-bold text-[#0872b9] underline-offset-4"
                  href="/transcripts"
                >
                  Clear search
                </Link>
              </div>
              <ul className="m-0 mt-2 list-none p-0">
                {items.map((item) => (
                  <TranscriptListItem item={item} key={item.videoId} />
                ))}
              </ul>
              <Pagination
                hrefFor={(target) =>
                  transcriptHref({ q: query, scope: "videos", page: target })
                }
                page={page}
                pageCount={pageCount}
              />
            </div>
          )
        ) : items.length === 0 ? (
          <div className="mt-10 max-w-190 rounded-2xl border border-[#e2e8f0] bg-[#f7f4ec] p-8 text-[#64748b]">
            <strong className="text-[#202124]">
              The public archive is waiting for its first transcript.
            </strong>
            <p className="mb-0 leading-relaxed">
              Browse and search appear here only after a signed-in user makes an
              explicit, complete public contribution.
            </p>
          </div>
        ) : (
          <ul className="m-0 mt-8 list-none p-0">
            {items.map((item) => (
              <TranscriptListItem item={item} key={item.videoId} />
            ))}
          </ul>
        )}

        {!querying && items.length > 0 ? (
          <Pagination
            hrefFor={(target) => transcriptHref({ page: target })}
            page={page}
            pageCount={pageCount}
          />
        ) : null}
      </div>
    </main>
  );
}
