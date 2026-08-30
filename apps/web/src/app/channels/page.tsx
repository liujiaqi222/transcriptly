import type { Metadata } from "next";
import { ChannelAvatar } from "@/app/channels/components/channel-avatar";
import { LogoMark } from "@/components/logo-mark";
import { getDatabase } from "@/db/client";
import { listChannels } from "@/lib/channels/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Channels - Transcriptly",
  description:
    "Every YouTube channel with public transcripts in the Transcriptly archive.",
  alternates: { canonical: "/channels" },
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export default async function ChannelsPage() {
  const channels = await listChannels(getDatabase());

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
        <h1 className="m-0 font-serif text-[clamp(32px,4vw,44px)] leading-[1.05] font-semibold tracking-[-0.03em]">
          Channels
        </h1>
        {channels.length === 0 ? (
          <p className="mt-8 text-[#64748b]">
            No channel has a public transcript yet.
          </p>
        ) : (
          <ul className="m-0 mt-8 list-none p-0">
            {channels.map((channel) => (
              <li
                className="border-t border-[#e2e8f0] first:border-t-0"
                key={channel.id}
              >
                <article className="flex items-center gap-4 rounded-[10px] py-4 hover:bg-[#edf7ff]">
                  <ChannelAvatar
                    avatarUrl={channel.avatarUrl}
                    name={channel.name}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <a
                        className="rounded-sm text-base font-bold text-[#202124] no-underline focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40"
                        href={`/channels/${channel.slug}`}
                      >
                        {channel.name}
                      </a>
                      <span className="font-mono text-xs text-[#64748b] tabular-nums">
                        {channel.transcriptCount}{" "}
                        {channel.transcriptCount === 1
                          ? "transcript"
                          : "transcripts"}
                      </span>
                    </div>
                    {channel.latestTranscript ? (
                      <p className="mt-1 mb-0 truncate text-sm text-[#64748b]">
                        Latest:{" "}
                        <a
                          className="font-bold text-[#0872b9] underline-offset-4"
                          href={`/transcripts/${channel.latestTranscript.videoId}`}
                        >
                          {channel.latestTranscript.title}
                        </a>
                        {channel.latestPublicationAt
                          ? ` · ${dateFormatter.format(
                              channel.latestPublicationAt,
                            )}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
