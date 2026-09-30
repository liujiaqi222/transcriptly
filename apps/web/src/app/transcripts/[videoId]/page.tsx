import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TranscriptPlayerProvider } from "@/app/transcripts/[videoId]/components/transcript-player-context";
import { TranscriptSection } from "@/app/transcripts/[videoId]/components/transcript-section";
import { VideoDescription } from "@/app/transcripts/[videoId]/components/video-description";
import { YouTubePlayer } from "@/app/transcripts/[videoId]/components/youtube-player";
import { SiteHeader } from "@/components/site-header";
import { getDatabase } from "@/db/client";
import { getAuthEnv } from "@/env/server";
import { formatTimestamp } from "@/lib/captures/transcript";
import { YOUTUBE_VIDEO_ID_PATTERN } from "@/lib/contributions/validation";
import { getPublicTranscript } from "@/lib/publications/queries";
import { normalizeQuery } from "@/lib/search/search";

export const dynamic = "force-dynamic";
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function publicDescription(
  title: string,
  channel: string,
  description: string,
) {
  const source =
    description.trim() ||
    `Read the complete timestamped transcript of ${title} by ${channel}.`;
  return source.slice(0, 160);
}

/** ISO-8601 duration in the canonical PT#H#M#S form search engines expect. */
function isoDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts =
    `${hours ? `${hours}H` : ""}` +
    `${minutes ? `${minutes}M` : ""}` +
    `${seconds || (hours === 0 && minutes === 0) ? `${seconds}S` : ""}`;
  return `PT${parts}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ videoId: string }>;
}): Promise<Metadata> {
  const { videoId } = await params;
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) return {};
  const item = await getPublicTranscript(getDatabase(), videoId);
  if (!item) return {};
  const description = publicDescription(
    item.title,
    item.channelName ?? "an unknown channel",
    item.description,
  );
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  return {
    title: `${item.title} — Transcriptly`,
    description,
    alternates: { canonical: `/transcripts/${videoId}` },
    openGraph: {
      title: item.title,
      description,
      type: "video.other",
      url: `/transcripts/${videoId}`,
      images: [thumbnail],
    },
    twitter: {
      card: "summary_large_image",
      title: item.title,
      description,
      images: [thumbnail],
    },
  };
}

export default async function PublicVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ q?: string; hit?: string }>;
}) {
  const { videoId } = await params;
  const { q, hit } = await searchParams;
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) notFound();
  const item = await getPublicTranscript(getDatabase(), videoId);
  if (!item) notFound();
  // Search terms carried over from the results list so the reader page can
  // mark and scroll to the hit that brought the visitor here.
  const query = normalizeQuery(q ?? "") ?? "";
  const hitStart =
    hit !== undefined && /^\d+$/.test(hit) ? Number(hit) : undefined;
  const description = publicDescription(
    item.title,
    item.channelName ?? "an unknown channel",
    item.description,
  );
  const canonical = `${getAuthEnv().BETTER_AUTH_URL}/transcripts/${videoId}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: item.title,
    description,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    ...(item.publishedAt ? { uploadDate: item.publishedAt.toISOString() } : {}),
    ...(item.durationSeconds !== null
      ? { duration: isoDuration(item.durationSeconds) }
      : {}),
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    url: canonical,
  };

  return (
    <main className="min-h-screen bg-[#fffdf8] font-sans text-[#202124]">
      <SiteHeader />
      <article className="mx-auto w-[min(820px,calc(100%-48px))] py-18 pb-28 max-sm:w-[calc(100%-32px)] max-sm:py-12 max-sm:pb-20">
        <TranscriptPlayerProvider>
          <h1 className="m-0 font-serif text-[clamp(36px,5vw,56px)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">
            {item.title}
          </h1>
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#64748b]">
            {item.channelSlug ? (
              <Link
                className="font-bold text-[#0872b9] underline-offset-4"
                href={`/channels/${item.channelSlug}`}
              >
                {item.channelName}
              </Link>
            ) : item.channelName ? (
              <span>{item.channelName}</span>
            ) : null}
            {item.publishedAt ? (
              <span>Published {dateFormatter.format(item.publishedAt)}</span>
            ) : null}
            {item.durationSeconds !== null ? (
              <span>{formatTimestamp(item.durationSeconds)}</span>
            ) : null}
            <span>Added {dateFormatter.format(item.publicPublishedAt)}</span>
          </div>
          {item.description.trim() ? (
            <VideoDescription description={item.description} />
          ) : null}
          {item.contributor ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-[#64748b]">
              {item.contributor.avatarUrl ? (
                // biome-ignore lint/performance/noImgElement: remote contributor avatars are optional attribution, not page imagery.
                <img
                  className="h-6 w-6 rounded-full object-cover"
                  src={item.contributor.avatarUrl}
                  alt=""
                  width="24"
                  height="24"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span
                  className="grid h-6 w-6 place-items-center rounded-full bg-[#edf7ff] text-xs font-extrabold text-[#0872b9]"
                  aria-hidden="true"
                >
                  {item.contributor.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span>
                Contributed by{" "}
                <strong className="font-semibold text-[#202124]">
                  {item.contributor.displayName}
                </strong>
              </span>
            </div>
          ) : null}
          <div className="mt-6">
            <YouTubePlayer
              initialStart={hitStart}
              title={item.title}
              videoId={videoId}
            />
            <div className="mt-2.5 flex items-center justify-end">
              <a
                className="inline-flex items-center gap-1 text-xs font-medium text-[#64748b] underline-offset-4 transition-colors hover:text-[#0872b9] hover:underline focus-visible:outline-[2px] focus-visible:outline-offset-2 focus-visible:outline-[#1b90ed]/40"
                href={item.url}
                rel="noreferrer"
                target="_blank"
              >
                <span>Watch on YouTube</span>
                <ExternalLink
                  aria-hidden="true"
                  className="opacity-70"
                  size={12}
                />
              </a>
            </div>
          </div>
          <TranscriptSection
            chapters={item.chapters}
            hitStart={hitStart}
            query={query === "" ? undefined : query}
            segments={item.segments}
            url={item.url}
          />
        </TranscriptPlayerProvider>
      </article>
      <script type="application/ld+json">
        {JSON.stringify(jsonLd).replace(/</g, "\\u003c")}
      </script>
    </main>
  );
}
