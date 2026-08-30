import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TranscriptSection } from "@/app/videos/[videoId]/components/transcript-section";
import { LogoMark } from "@/components/logo-mark";
import { getDatabase } from "@/db/client";
import { getAuthEnv } from "@/env/server";
import { formatTimestamp } from "@/lib/captures/transcript";
import { YOUTUBE_VIDEO_ID_PATTERN } from "@/lib/contributions/validation";
import { getPublicTranscript } from "@/lib/publications/queries";

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
    item.channelName,
    item.description,
  );
  const thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  return {
    title: `${item.title} — Transcriptly`,
    description,
    alternates: { canonical: `/videos/${videoId}` },
    openGraph: {
      title: item.title,
      description,
      type: "video.other",
      url: `/videos/${videoId}`,
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
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) notFound();
  const item = await getPublicTranscript(getDatabase(), videoId);
  if (!item) notFound();
  const description = publicDescription(
    item.title,
    item.channelName,
    item.description,
  );
  const canonical = `${getAuthEnv().BETTER_AUTH_URL}/videos/${videoId}`;
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
            href="/#archive"
          >
            Search the archive
          </a>
        </div>
      </header>
      <article className="mx-auto w-[min(820px,calc(100%-48px))] py-18 pb-28 max-sm:w-[calc(100%-32px)] max-sm:py-12 max-sm:pb-20">
        <h1 className="m-0 font-serif text-[clamp(36px,5vw,56px)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">
          {item.title}
        </h1>
        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#64748b]">
          <a
            className="font-bold text-[#0872b9] underline-offset-4"
            href={item.channelUrl || item.url}
            rel="noreferrer"
            target="_blank"
          >
            {item.channelName}
          </a>
          {item.publishedAt ? (
            <span>Published {dateFormatter.format(item.publishedAt)}</span>
          ) : null}
          {item.durationSeconds !== null ? (
            <span>{formatTimestamp(item.durationSeconds)}</span>
          ) : null}
          <span>Added {dateFormatter.format(item.publicPublishedAt)}</span>
        </div>
        {item.description.trim() ? (
          <p className="mt-8 mb-0 max-w-[68ch] whitespace-pre-line text-lg leading-[1.7] text-[#64748b]">
            {item.description}
          </p>
        ) : null}
        <a
          className="mt-7 inline-flex rounded-[10px] border border-[#202124] px-3.5 py-2.5 font-bold no-underline transition-colors hover:bg-[#202124] hover:text-white focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
          href={item.url}
          rel="noreferrer"
          target="_blank"
        >
          Watch on YouTube →
        </a>
        {item.contributor ? (
          <div className="mt-6 flex items-center gap-2.5 text-sm text-[#64748b]">
            {item.contributor.avatarUrl ? (
              // biome-ignore lint/performance/noImgElement: remote contributor avatars are optional attribution, not page imagery.
              <img
                className="h-8 w-8 rounded-full object-cover"
                src={item.contributor.avatarUrl}
                alt=""
                width="32"
                height="32"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                className="grid h-8 w-8 place-items-center rounded-full bg-[#edf7ff] font-extrabold text-[#0872b9]"
                aria-hidden="true"
              >
                {item.contributor.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span>
              Contributed by <strong>{item.contributor.displayName}</strong>
            </span>
          </div>
        ) : null}
        <TranscriptSection
          chapters={item.chapters}
          segmentCount={item.segmentCount}
          segments={item.segments}
          url={item.url}
        />
      </article>
      <script type="application/ld+json">
        {JSON.stringify(jsonLd).replace(/</g, "\\u003c")}
      </script>
    </main>
  );
}
