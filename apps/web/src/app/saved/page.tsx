import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@/db/client";
import { auth } from "@/lib/auth/auth";
import { listSavedItems } from "@/lib/captures/queries";
import { SavedHeader } from "./saved-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function parsePage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** Page 1 keeps the canonical URL without a query string. */
function pageHref(page: number): string {
  return page <= 1 ? "/saved" : `/saved?page=${page}`;
}

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in?callbackURL=%2Fsaved");
  }

  const { page: rawPage } = await searchParams;
  const result = await listSavedItems(
    getDatabase(),
    session.user.id,
    parsePage(rawPage),
  );

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <SavedHeader email={session.user.email} />

      <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <p className="text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
          Saved
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.05em] sm:text-5xl">
          Your transcripts
        </h1>

        {result.items.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">Nothing saved yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
              Capture a YouTube video with the Transcriptly extension and choose
              Cloud Save to keep its transcript here.
            </p>
          </div>
        ) : (
          <>
            <ul className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.items.map((item) => (
                <li key={item.videoId}>
                  <a
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:border-zinc-400 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950"
                    href={`/saved/${item.videoId}`}
                  >
                    {/* biome-ignore lint/performance/noImgElement: YouTube thumbnails are remote and cached by YouTube; next/image adds an optimization hop for no gain on this SSR-only page. */}
                    <img
                      alt=""
                      className="aspect-video w-full bg-zinc-100 object-cover"
                      height={180}
                      loading="lazy"
                      src={`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
                      width={320}
                    />
                    <div className="flex flex-1 flex-col gap-1 p-4">
                      <h2 className="line-clamp-2 text-sm font-semibold leading-5 group-hover:underline">
                        {item.title}
                      </h2>
                      <p className="truncate text-sm text-zinc-600">
                        {item.channelName}
                      </p>
                      <p className="mt-auto pt-2 text-xs text-zinc-500">
                        {item.segmentCount}{" "}
                        {item.segmentCount === 1 ? "segment" : "segments"} ·{" "}
                        {dateFormatter.format(item.capturedAt)}
                      </p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>

            {result.pageCount > 1 ? (
              <nav
                aria-label="Pagination"
                className="mt-10 flex items-center justify-between"
              >
                {result.page > 1 ? (
                  <a
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950"
                    href={pageHref(result.page - 1)}
                  >
                    ← Previous
                  </a>
                ) : (
                  <span className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-300">
                    ← Previous
                  </span>
                )}
                <span className="text-sm text-zinc-500">
                  Page {result.page} of {result.pageCount}
                </span>
                {result.page < result.pageCount ? (
                  <a
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950"
                    href={pageHref(result.page + 1)}
                  >
                    Next →
                  </a>
                ) : (
                  <span className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-300">
                    Next →
                  </span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
