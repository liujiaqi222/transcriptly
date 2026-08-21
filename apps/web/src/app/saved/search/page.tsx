import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@/db/client";
import { auth } from "@/lib/auth/auth";
import { formatTimestamp, timestampUrl } from "@/lib/captures/transcript";
import {
  normalizeQuery,
  type SearchHit,
  searchLibrary,
} from "@/lib/search/search";
import { SavedHeader } from "../saved-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type SearchOutcome =
  | { status: "empty" }
  | { status: "results"; query: string; hits: SearchHit[] }
  | { status: "failed" };

function logSearchCompleted(
  requestId: string,
  resultCount: number,
  durationMs: number,
): void {
  // Deliberately limited fields: the search term and transcript text are
  // never logged (#39).
  console.info(
    JSON.stringify({
      event: "library_search_completed",
      requestId,
      resultCount,
      durationMs,
    }),
  );
}

function logSearchFailed(
  requestId: string,
  durationMs: number,
  error: unknown,
): void {
  console.error(
    JSON.stringify({
      event: "library_search_failed",
      requestId,
      durationMs,
      error: error instanceof Error ? error.name : "unknown_search_error",
    }),
  );
}

async function runSearch(
  requestId: string,
  userId: string,
  rawQuery: string | undefined,
): Promise<SearchOutcome> {
  const query = normalizeQuery(rawQuery ?? "");
  if (query === null) return { status: "empty" };

  const started = performance.now();
  try {
    const result = await searchLibrary(getDatabase(), userId, query);
    logSearchCompleted(
      requestId,
      result.hits.length,
      performance.now() - started,
    );
    return { status: "results", query, hits: result.hits };
  } catch (error) {
    logSearchFailed(requestId, performance.now() - started, error);
    return { status: "failed" };
  }
}

function groupByVideo(hits: SearchHit[]): Map<string, SearchHit[]> {
  const grouped = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const bucket = grouped.get(hit.videoId);
    if (bucket) bucket.push(hit);
    else grouped.set(hit.videoId, [hit]);
  }
  return grouped;
}

export default async function SavedSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    const target = q
      ? `/saved/search?q=${encodeURIComponent(q)}`
      : "/saved/search";
    redirect(`/sign-in?callbackURL=${encodeURIComponent(target)}`);
  }

  const requestId = crypto.randomUUID();
  const outcome = await runSearch(requestId, session.user.id, q);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <SavedHeader email={session.user.email} query={q} />

      <section className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
          Search
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.05em] sm:text-4xl">
          {outcome.status === "results"
            ? `“${outcome.query}” in your transcripts`
            : "Search your transcripts"}
        </h1>

        {outcome.status === "empty" ? (
          <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">Enter a search term</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
              Search the exact words and names inside your saved transcripts.
              Results link straight back to the moment in the video.
            </p>
          </div>
        ) : outcome.status === "failed" ? (
          <div
            className="mt-10 rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center"
            role="alert"
          >
            <h2 className="text-lg font-semibold text-red-900">
              Search is unavailable
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-red-800">
              Something went wrong while searching your library. Please try
              again in a moment.
            </p>
          </div>
        ) : outcome.hits.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">No matches</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
              No transcript segment contains “{outcome.query}”. Try a different
              word, a name, or a shorter phrase.
            </p>
          </div>
        ) : (
          <SearchResults hits={outcome.hits} />
        )}
      </section>
    </main>
  );
}

function SearchResults({ hits }: { hits: SearchHit[] }) {
  const grouped = groupByVideo(hits);

  return (
    <div className="mt-10 space-y-10">
      {[...grouped].map(([videoId, videoHits]) => {
        const first = videoHits[0];
        if (!first) return null;
        return (
          <section key={videoId} className="space-y-4">
            <header className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-6">
                  <a
                    className="underline-offset-4 hover:underline"
                    href={`/saved/${videoId}`}
                  >
                    {first.title}
                  </a>
                </h2>
                <p className="mt-1 truncate text-sm text-zinc-600">
                  {first.channelName}
                </p>
              </div>
              <a
                className="shrink-0 text-sm font-semibold text-zinc-600 underline-offset-4 hover:underline"
                href={first.url}
                rel="noreferrer"
                target="_blank"
              >
                Source on YouTube
              </a>
            </header>

            <ol className="space-y-3">
              {videoHits.map((hit) => (
                <li
                  key={hit.key}
                  className="rounded-xl border border-zinc-200 bg-white p-4"
                >
                  <ol className="space-y-1">
                    {hit.window.map((segment) => (
                      <li
                        className={`flex gap-3 rounded-lg px-2 py-1.5 leading-6 ${
                          segment.isHit ? "bg-sky-50" : ""
                        }`}
                        key={`${hit.key}:${segment.position}`}
                      >
                        <a
                          className="shrink-0 font-mono text-sm text-sky-700 underline-offset-4 tabular-nums hover:underline"
                          href={timestampUrl(first.url, segment.start)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {formatTimestamp(segment.start)}
                        </a>
                        <span
                          className={`text-sm ${
                            segment.isHit
                              ? "font-semibold text-zinc-950"
                              : "text-zinc-700"
                          }`}
                        >
                          {segment.text}
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
