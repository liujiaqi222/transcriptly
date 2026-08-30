import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Pagination } from "@/app/transcripts/components/pagination";
import { TranscriptListItem } from "@/app/transcripts/components/transcript-list-item";
import { LogoMark } from "@/components/logo-mark";
import { getDatabase } from "@/db/client";
import {
  CHANNEL_PAGE_SIZE,
  channelUrlFromHandle,
  countChannelVideos,
  findChannelBySlug,
  listChannelVideos,
} from "@/lib/channels/queries";

export const dynamic = "force-dynamic";

function parsePage(raw: string | undefined): number {
  if (!raw) return 1;
  if (!/^\d+$/.test(raw)) return Number.NaN;
  return Number.parseInt(raw, 10);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const channel = await findChannelBySlug(getDatabase(), slug);
  if (!channel) return {};
  return {
    title: `${channel.name} transcripts - Transcriptly`,
    description: `All ${channel.transcriptCount} public transcript${
      channel.transcriptCount === 1 ? "" : "s"
    } from ${channel.name}.`,
    alternates: { canonical: `/channels/${slug}` },
  };
}

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ slug }, { page: rawPage }] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = parsePage(rawPage);
  if (!Number.isInteger(page) || page < 1) notFound();

  const db = getDatabase();
  const channel = await findChannelBySlug(db, slug);
  if (!channel) notFound();

  const [items, total] = await Promise.all([
    listChannelVideos(db, channel.id, page),
    countChannelVideos(db, channel.id),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / CHANNEL_PAGE_SIZE));
  if (page > pageCount) notFound();

  return (
    <main className="min-h-screen bg-[#fffdf8] font-sans text-[#202124]">
      <header className="border-b border-[#e2e8f0] bg-white">
        <div className="mx-auto flex min-h-18 w-[min(920px,calc(100%-48px))] items-center justify-between max-sm:w-[calc(100%-32px)]">
          <a
            className="inline-flex items-center gap-2 text-lg font-extrabold tracking-[-0.03em] no-underline"
            href="/"
          >
            <LogoMark size={28} />
            <span>Transcriptly</span>
          </a>
          <a
            className="text-sm font-bold text-[#0872b9] underline-offset-4"
            href="/transcripts"
          >
            All transcripts
          </a>
        </div>
      </header>
      <div className="mx-auto w-[min(920px,calc(100%-48px))] py-12 pb-24 max-sm:w-[calc(100%-32px)] max-sm:py-8">
        <p className="m-0 text-sm font-bold tracking-[0.14em] text-[#0872b9] uppercase">
          <a className="no-underline hover:underline" href="/channels">
            Channels
          </a>
        </p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="m-0 font-serif text-[clamp(32px,4vw,44px)] leading-[1.05] font-semibold tracking-[-0.03em]">
            {channel.name}
          </h1>
          <span className="font-mono text-sm text-[#64748b] tabular-nums">
            {total} {total === 1 ? "transcript" : "transcripts"}
          </span>
          <a
            className="text-sm font-bold text-[#0872b9] underline-offset-4"
            href={channelUrlFromHandle(channel.handle)}
            rel="noreferrer"
            target="_blank"
          >
            {"YouTube ->"}
          </a>
        </div>

        {items.length === 0 ? (
          <p className="mt-8 text-[#64748b]">
            This channel has no public transcripts yet.
          </p>
        ) : (
          <ul className="m-0 mt-8 list-none p-0">
            {items.map((item) => (
              <TranscriptListItem
                item={{
                  ...item,
                  channelName: channel.name,
                  channelHandle: channel.handle,
                  channelSlug: channel.slug,
                }}
                key={item.videoId}
              />
            ))}
          </ul>
        )}

        <Pagination
          hrefFor={(target) =>
            target === 1
              ? `/channels/${channel.slug}`
              : `/channels/${channel.slug}?page=${target}`
          }
          page={page}
          pageCount={pageCount}
        />
      </div>
    </main>
  );
}
