import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LogoMark } from "@/components/logo-mark";
import { getDatabase } from "@/db/client";
import { auth } from "@/lib/auth/auth";
import { formatTimestamp } from "@/lib/captures/transcript";
import { listUserContributions } from "@/lib/contributions/queries";
import { RemoveContributionButton } from "./components/remove-contribution-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My contributions - Transcriptly",
  description: "The videos you currently contribute to the public archive.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/contributions" },
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export default async function MyContributionsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in?callbackURL=%2Fcontributions");
  }

  const contributions = await listUserContributions(
    getDatabase(),
    session.user.id,
  );

  return (
    <main className="min-h-screen bg-[#fffdf8] font-sans text-[#202124]">
      <header className="border-b border-[#e2e8f0] bg-white">
        <div className="mx-auto flex min-h-18 w-[min(820px,calc(100%-48px))] items-center justify-between max-sm:w-[calc(100%-32px)]">
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
      <div className="mx-auto w-[min(820px,calc(100%-48px))] py-18 pb-28 max-sm:w-[calc(100%-32px)] max-sm:py-12 max-sm:pb-20">
        <p className="m-0 text-sm font-bold tracking-[0.14em] text-[#0872b9] uppercase">
          My contributions
        </p>
        <h1 className="mt-3 mb-0 text-[clamp(38px,6vw,56px)] leading-[1.04] font-extrabold tracking-[-0.04em]">
          Videos you keep in the archive.
        </h1>
        <p className="mt-5 mb-0 max-w-[60ch] text-lg leading-[1.65] text-[#64748b]">
          Each entry is a video you currently contribute to the public
          transcript archive. Removing your contribution takes your name off the
          video; if you are the last contributor, the video is unpublished and
          its transcript is deleted.
        </p>

        {contributions.length === 0 ? (
          <p className="mt-16 mb-0 text-lg leading-[1.65] text-[#64748b]">
            You have not contributed to any videos yet. Contribute a transcript
            from the Transcriptly extension to see it here.
          </p>
        ) : (
          <ul className="mt-12 mb-0 list-none p-0">
            {contributions.map((item) => (
              <li
                className="border-t border-[#e2e8f0] py-6 first:border-t-0 first:pt-0"
                key={item.videoId}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                  <a
                    className="text-xl font-bold tracking-[-0.02em] text-[#202124] underline-offset-4 hover:text-[#0872b9]"
                    href={`/videos/${item.videoId}`}
                  >
                    {item.title}
                  </a>
                  <span className="text-sm text-[#64748b]">
                    {item.segmentCount} segments ·{" "}
                    {item.durationSeconds !== null
                      ? formatTimestamp(item.durationSeconds)
                      : "duration unknown"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="m-0 text-sm leading-6 text-[#64748b]">
                    {item.channelName ? (
                      <a
                        className="font-bold text-[#0872b9] underline-offset-4"
                        href={item.channelUrl || "#"}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {item.channelName}
                      </a>
                    ) : (
                      "Unknown channel"
                    )}
                    <span className="mx-2" aria-hidden="true">
                      ·
                    </span>
                    You contributed {dateFormatter.format(item.contributedAt)}
                  </p>
                  <RemoveContributionButton
                    title={item.title}
                    videoId={item.videoId}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
