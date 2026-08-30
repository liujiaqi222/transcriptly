import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChannelAvatar } from "@/app/channels/components/channel-avatar";
import { Pagination } from "@/app/transcripts/components/pagination";
import { TranscriptListItem } from "@/app/transcripts/components/transcript-list-item";
import { SiteHeader } from "@/components/site-header";
import { getDatabase } from "@/db/client";
import {
  CHANNEL_PAGE_SIZE,
  channelUrlFromHandle,
  countChannelVideos,
  findChannelBySlug,
  listChannelVideos,
} from "@/lib/channels/queries";
import { parsePageParam } from "@/lib/pagination";

export const dynamic = "force-dynamic";

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
  const page = parsePageParam(rawPage);
  if (page === null) notFound();

  const db = getDatabase();
  const channel = await findChannelBySlug(db, slug);
  if (!channel) notFound();

  const total = await countChannelVideos(db, channel.id);
  const pageCount = Math.max(1, Math.ceil(total / CHANNEL_PAGE_SIZE));
  if (page > pageCount) notFound();
  const items = await listChannelVideos(db, channel.id, page);

  return (
    <main className="min-h-screen bg-[#fffdf8] font-sans text-[#202124]">
      <SiteHeader />
      <div className="mx-auto w-[min(920px,calc(100%-48px))] py-12 pb-24 max-sm:w-[calc(100%-32px)] max-sm:py-8">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-sm font-bold text-[#64748b]"
        >
          <Link
            className="text-[#0872b9] no-underline hover:underline"
            href="/transcripts"
          >
            Transcripts
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            className="text-[#0872b9] no-underline hover:underline"
            href="/channels"
          >
            Channels
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{channel.name}</span>
        </nav>
        <div className="mt-4 flex items-center gap-4">
          <ChannelAvatar
            avatarUrl={channel.avatarUrl}
            name={channel.name}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="m-0 font-serif text-[clamp(32px,4vw,44px)] leading-[1.05] font-semibold tracking-[-0.03em]">
              {channel.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-2">
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
          </div>
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
