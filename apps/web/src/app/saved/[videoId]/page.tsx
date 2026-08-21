import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDatabase } from "@/db/client";
import { auth } from "@/lib/auth/auth";
import { getSavedItem } from "@/lib/captures/queries";
import {
  formatTimestamp,
  timestampUrl,
  transcriptBlocks,
} from "@/lib/captures/transcript";
import { SavedHeader } from "../saved-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export default async function SavedItemPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  if (!YOUTUBE_VIDEO_ID.test(videoId)) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`/sign-in?callbackURL=${encodeURIComponent(`/saved/${videoId}`)}`);
  }

  const item = await getSavedItem(getDatabase(), session.user.id, videoId);
  if (!item) {
    notFound();
  }

  const blocks = transcriptBlocks(item);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <SavedHeader email={session.user.email} />

      <article className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <a
          className="text-sm font-semibold text-zinc-600 transition hover:text-zinc-950"
          href="/saved"
        >
          ← All saved transcripts
        </a>

        <h1 className="mt-6 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
          {item.title}
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          {item.channelUrl ? (
            <a
              className="font-semibold text-zinc-800 underline-offset-4 hover:underline"
              href={item.channelUrl}
              rel="noreferrer"
              target="_blank"
            >
              {item.channelName}
            </a>
          ) : (
            <span className="font-semibold text-zinc-800">
              {item.channelName}
            </span>
          )}
          {" · "}
          <a
            className="underline-offset-4 hover:underline"
            href={item.url}
            rel="noreferrer"
            target="_blank"
          >
            Source on YouTube
          </a>
          {item.publishedAt
            ? ` · Published ${dateFormatter.format(item.publishedAt)}`
            : ""}
          {item.durationSeconds !== null
            ? ` · ${formatTimestamp(item.durationSeconds)}`
            : ""}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Captured {dateFormatter.format(item.capturedAt)}
        </p>

        {item.description.trim().length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
              Description
            </h2>
            <p className="mt-3 text-sm leading-6 whitespace-pre-line text-zinc-700">
              {item.description}
            </p>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="text-xs font-semibold tracking-[0.16em] text-zinc-500 uppercase">
            Transcript
          </h2>
          {blocks.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">
              This capture has no transcript segments.
            </p>
          ) : (
            <ol className="mt-4 space-y-1">
              {blocks.map((block, index) =>
                block.kind === "chapter" ? (
                  <li key={`chapter-${index}`}>
                    <h3 className="pt-6 pb-2 text-base font-bold tracking-[-0.01em] text-zinc-950">
                      {block.title}
                    </h3>
                  </li>
                ) : (
                  <li
                    key={`segment-${index}`}
                    className="flex gap-3 rounded-lg px-2 py-1.5 leading-6 hover:bg-white"
                  >
                    <a
                      className="shrink-0 font-mono text-sm text-sky-700 underline-offset-4 tabular-nums hover:underline"
                      href={timestampUrl(item.url, block.start)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {formatTimestamp(block.start)}
                    </a>
                    <span className="text-sm text-zinc-800">{block.text}</span>
                  </li>
                ),
              )}
            </ol>
          )}
        </section>
      </article>
    </main>
  );
}
