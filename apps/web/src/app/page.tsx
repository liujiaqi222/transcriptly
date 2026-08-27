import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import { LogoMark } from "@/components/logo-mark";
import { getDatabase } from "@/db/client";
import { listPublicTranscripts } from "@/lib/publications/queries";
import { searchPublicArchive } from "@/lib/search/search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transcriptly — Turn YouTube into a knowledge base",
  description:
    "Capture videos, playlists, and channels as timestamped Markdown. Keep a local knowledge base and optionally contribute to a public transcript archive.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Transcriptly — Turn YouTube into a knowledge base",
    description:
      "Capture YouTube transcripts in batch and keep them locally as portable Markdown.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Transcriptly — Turn YouTube into a knowledge base",
    description:
      "Capture YouTube transcripts in batch and keep them locally as portable Markdown.",
  },
};

const GITHUB_URL = "https://github.com/liujiaqi222/transcriptly";
const CHROME_INSTALL_URL = `${GITHUB_URL}#%E4%BA%BA%E5%B7%A5%E8%BF%90%E8%A1%8C%E4%B8%8E%E9%AA%8C%E8%AF%81`;
const pageWidth =
  "mx-auto w-[min(1200px,calc(100%_-_48px))] max-sm:w-[calc(100%_-_32px)]";
const focusRing =
  "focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40";

const eyebrow =
  "mb-4 text-[13px] font-bold tracking-[0.14em] text-[#0872b9] uppercase";

// Demo titles stay short enough to render without ellipsis and match the
// file names in the Markdown tree and the rows in the batch manager.
const demoVideos = [
  ["Reliable AI Agents", "18:42"],
  ["Context Engineering", "32:08"],
  ["Workflow Evaluation", "24:16"],
] as const;

function Brand() {
  return (
    <a
      className={`inline-flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.03em] no-underline ${focusRing}`}
      href="/"
      aria-label="Transcriptly home"
    >
      <LogoMark size={28} />
      <span>Transcriptly</span>
    </a>
  );
}

function CtaPair({ compact = false }: { compact?: boolean }) {
  const button = `inline-flex items-center justify-center rounded-xl border px-5 py-3 text-sm font-bold no-underline transition-colors ${focusRing}`;
  return (
    <div
      className={`flex flex-wrap items-center ${compact ? "gap-2" : "gap-3"}`}
    >
      <a
        className={`${button} border-[#f5c451] bg-[#f5c451] text-[#202124] hover:border-[#e7b642] hover:bg-[#e7b642] ${compact ? "min-h-10 px-4 py-2" : "min-h-12"}`}
        href={CHROME_INSTALL_URL}
        rel="noreferrer"
        target="_blank"
      >
        Add to Chrome
      </a>
      {!compact && (
        <a
          className={`${button} border-[#202124] bg-transparent text-[#202124] hover:border-[#1b90ed] hover:text-[#0872b9] min-h-12`}
          href={GITHUB_URL}
          rel="noreferrer"
          target="_blank"
        >
          View on GitHub
        </a>
      )}
    </div>
  );
}

function DemoCheck({ index, animated }: { index: number; animated: boolean }) {
  return (
    <span
      className="relative grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-white shadow-[inset_0_0_0_1.5px_#cbd5e1]"
      aria-hidden="true"
    >
      <span
        className={`absolute inset-0 grid place-items-center rounded-[5px] bg-[#1b90ed] text-white ${animated ? "demo-check-face" : ""}`}
        style={
          animated ? { animationDelay: `${0.3 + index * 0.35}s` } : undefined
        }
      >
        <Check size={12} strokeWidth={3.25} />
      </span>
    </span>
  );
}

function SelectionDemo({
  dense = false,
  animated = false,
  surface = "border-[#e2e8f0] bg-white",
}: {
  dense?: boolean;
  animated?: boolean;
  surface?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border ${surface}`}
    >
      <div
        className={`flex items-center gap-2 border-b border-[#e2e8f0] px-3 py-2 text-xs font-bold ${dense ? "min-h-10" : "min-h-12"}`}
      >
        <span className="h-3.5 w-5 rounded bg-[#202124]" aria-hidden="true" />
        <span>AI Notes · Videos</span>
      </div>
      <ul className="m-0 list-none p-0">
        {demoVideos.map(([title, duration], index) => (
          <li
            className={`grid items-center gap-2 border-b border-[#e2e8f0] px-3 py-2 ${dense ? "min-h-14 grid-cols-[52px_18px_minmax(0,1fr)] px-2 py-1.5" : "min-h-[68px] grid-cols-[72px_20px_minmax(0,1fr)]"}`}
            key={title}
          >
            <span
              className={`grid place-items-center rounded-lg bg-slate-100 text-xs font-extrabold text-slate-400 ${dense ? "h-[34px] w-[52px]" : "h-11 w-[72px]"}`}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <DemoCheck index={index} animated={animated} />
            <span className="min-w-0">
              <strong className="block overflow-hidden text-xs text-ellipsis whitespace-nowrap">
                {title}
              </strong>
              <small className="mt-1 block text-[10px] text-[#64748b]">
                {duration}
              </small>
            </span>
          </li>
        ))}
      </ul>
      <div
        className={`mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] text-[#64748b] ${dense ? "p-2" : "p-3"}`}
      >
        <span>
          <strong className="text-[#202124] tabular-nums">37/50</strong>{" "}
          selected
        </span>
        {!dense && (
          <>
            <span>Load more</span>
            <span>Select all</span>
          </>
        )}
        <button
          className="ml-auto min-h-9 rounded-lg border-0 bg-[#f5c451] px-3 py-2 text-[11px] font-bold text-[#202124]"
          type="button"
          tabIndex={-1}
        >
          Start batch
        </button>
      </div>
    </div>
  );
}

function BatchManagerDemo({
  surface = "border-[#e2e8f0] bg-white",
}: {
  surface?: string;
}) {
  const states = [
    ["Reliable AI Agents", "captured", "bg-green-50 text-green-700"],
    ["Context Engineering", "running", "bg-[#edf7ff] text-[#0872b9]"],
    ["Workflow Evaluation", "queued", "bg-slate-100 text-[#64748b]"],
    ["Memory Systems", "failed", "bg-red-50 text-red-700"],
  ] as const;
  return (
    <div className={`flex min-w-0 flex-col rounded-2xl border ${surface} p-5`}>
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="font-bold">Batch Manager</span>
        <strong className="tabular-nums">29 / 37 done</strong>
      </div>
      <div
        className="my-4 h-2 overflow-hidden rounded-full bg-[#e2e8f0]"
        role="progressbar"
        aria-label="29 of 37 videos done"
        aria-valuemin={0}
        aria-valuemax={37}
        aria-valuenow={29}
      >
        <span className="block h-full w-[78%] rounded-full bg-[#1b90ed]" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {["Pause", "Resume", "Retry failed"].map((label) => (
          <button
            className="min-h-9 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-[11px] font-semibold"
            key={label}
            type="button"
            tabIndex={-1}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="m-0 list-none p-0">
        {states.map(([title, state, colors]) => (
          <li
            className="flex min-h-11 items-center justify-between gap-3 border-t border-[#e2e8f0] text-xs"
            key={title}
          >
            <span>{title}</span>
            <span
              className={`rounded-full px-2 py-1 text-[10px] font-bold capitalize ${colors}`}
            >
              {state}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MarkdownDemo() {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="min-h-11 overflow-hidden border-b border-[#e2e8f0] px-4 py-3.5 text-[11px] text-ellipsis whitespace-nowrap text-[#64748b]">
        Reliable AI Agents.md
      </div>
      <pre className="m-0 overflow-auto p-5 font-mono text-[11px] leading-[1.7] text-slate-700">{`---
title: "Reliable AI Agents"
channelName: "AI Notes"
url: "https://www.youtube.com/watch?v=..."
videoId: "aBcDeFg1234"
durationSeconds: 1122
capturedAt: "2026-08-26T14:32:00.000Z"
---

# Reliable AI Agents

**Source:** [Watch on YouTube](https://youtube.com/...)

## Transcript

### Start with observable behavior

- [00:00] Before you add tools, define the outcome…
- [01:04] A reliable agent makes progress visible…`}</pre>
    </div>
  );
}

function SectionHeading({
  id,
  index,
  eyebrow: label,
  title,
  copy,
}: {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="mb-12 max-w-[760px]">
      <p className={eyebrow}>
        {index} · {label}
      </p>
      <h2
        className="m-0 text-[clamp(38px,5vw,64px)] leading-[1.02] font-bold tracking-[-0.04em] text-balance"
        id={id}
      >
        {title}
      </h2>
      <p className="mt-5 mb-0 text-lg leading-[1.65] text-[#64748b]">{copy}</p>
    </div>
  );
}

function DemoArrow() {
  return (
    <div
      className="flex items-center justify-center text-[#1b90ed] max-sm:rotate-90"
      aria-hidden="true"
    >
      <ArrowRight size={22} strokeWidth={2.25} />
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim().slice(0, 200) ?? "";
  const db = getDatabase();
  const [publicItems, search] = await Promise.all([
    listPublicTranscripts(db, 4),
    query ? searchPublicArchive(db, query) : Promise.resolve(null),
  ]);

  return (
    <main className="min-w-0 overflow-clip bg-[#fffdf8] text-[#202124] selection:bg-[#f5c451] selection:text-[#202124]">
      <header className="sticky top-0 z-20 border-b border-[#e2e8f0] bg-[#fffdf8]">
        <div
          className={`${pageWidth} flex min-h-[72px] items-center gap-8 max-sm:min-h-16 max-sm:gap-3`}
        >
          <Brand />
          <div className="ml-auto">
            <CtaPair compact />
          </div>
        </div>
      </header>

      <section
        className={`${pageWidth} grid min-h-[calc(100vh_-_72px)] grid-cols-[minmax(0,0.8fr)_minmax(560px,1.2fr)] items-center gap-16 py-20 max-lg:min-h-0 max-lg:grid-cols-1 max-sm:gap-12 max-sm:py-14`}
        aria-labelledby="hero-title"
      >
        <div className="max-w-[600px] max-lg:max-w-[720px]">
          <h1
            className="m-0 text-[clamp(52px,5.6vw,80px)] leading-[0.98] font-extrabold tracking-[-0.04em] text-balance max-sm:text-[clamp(44px,14vw,64px)]"
            id="hero-title"
          >
            Turn YouTube into a knowledge base.
          </h1>
          <p className="my-7 max-w-[56ch] text-[19px] leading-[1.65] text-[#64748b] max-sm:text-[17px]">
            Capture a video, playlist, or entire channel as timestamped
            transcripts. Save everything locally as Markdown — searchable,
            portable, and yours.
          </p>
          <CtaPair />
          <p className="mt-5 mb-0 text-[13px] leading-relaxed text-[#64748b]">
            No account required for local saves · Plain Markdown · Open source
          </p>
        </div>
        <div
          className="grid select-none grid-cols-[minmax(0,1.18fr)_28px_minmax(150px,0.68fr)_28px_minmax(184px,0.8fr)] items-stretch max-sm:grid-cols-1 max-sm:gap-3"
          role="img"
          aria-label="Workflow demonstration: select videos from a playlist, capture 29 of 37 as transcripts, and save them as Markdown files on your computer"
        >
          <div className="flex min-w-0 flex-col">
            <span className="mb-2 block text-[11px] font-bold tracking-[0.06em] text-[#64748b] uppercase">
              Select
            </span>
            <SelectionDemo dense animated />
          </div>
          <DemoArrow />
          <div className="flex min-w-0 flex-col">
            <span className="mb-2 block text-[11px] font-bold tracking-[0.06em] text-[#64748b] uppercase">
              Capture
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-center rounded-2xl border border-[#e2e8f0] bg-white p-4 max-sm:min-h-44">
              <LogoMark size={24} />
              <strong className="mt-5 text-[12px] tabular-nums">
                <span className="inline-grid">
                  <span className="demo-count-first col-start-1 row-start-1">
                    Capturing 29 / 37
                  </span>
                  <span
                    className="demo-count-next col-start-1 row-start-1 opacity-0"
                    style={{ animationDelay: "3s" }}
                  >
                    Capturing 30 / 37
                  </span>
                  <span
                    className="demo-count-next col-start-1 row-start-1 opacity-0"
                    style={{ animationDelay: "6s" }}
                  >
                    Capturing 31 / 37
                  </span>
                </span>
              </strong>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
                <span className="demo-progress-fill block h-full w-[78%] rounded-full bg-[#1b90ed]" />
              </div>
              <small className="mt-3 text-[10px] leading-snug text-[#64748b]">
                Saving Markdown locally…
              </small>
            </div>
          </div>
          <DemoArrow />
          <div className="flex min-w-0 flex-col">
            <span className="mb-2 block text-[11px] font-bold tracking-[0.06em] text-[#64748b] uppercase">
              Markdown
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 rounded-2xl border border-[#e2e8f0] bg-white p-4 font-mono text-[10px] leading-snug text-[#64748b] max-sm:min-h-44">
              <strong className="text-[#202124]">youtube/AI Notes</strong>
              <span
                className="demo-file-line"
                style={{ animationDelay: "2.6s" }}
              >
                ├─ Reliable AI Agents.md
              </span>
              <span
                className="demo-file-line"
                style={{ animationDelay: "2.9s" }}
              >
                ├─ Context Engineering.md
              </span>
              <span
                className="demo-file-line"
                style={{ animationDelay: "3.2s" }}
              >
                └─ Workflow Evaluation.md
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-y border-[#e2e8f0] bg-white px-[max(24px,calc((100%_-_1200px)/2))] py-28 max-sm:py-20"
        id="batch"
        aria-labelledby="batch-title"
      >
        <SectionHeading
          id="batch-title"
          index="01"
          eyebrow="Batch"
          title="Capture channels, not just videos."
          copy="Stop saving transcripts one video at a time."
        />
        <div
          className="grid select-none grid-cols-[minmax(0,1.12fr)_48px_minmax(340px,0.88fr)] items-stretch max-lg:grid-cols-1 max-lg:gap-6"
          role="img"
          aria-label="Batch demonstration: select 37 of 50 playlist videos, then watch the batch manager capture them with pause, resume, and retry controls"
        >
          <SelectionDemo surface="border-[#e2e8f0] bg-[#fffdf8]" />
          <DemoArrow />
          <BatchManagerDemo surface="border-[#e2e8f0] bg-[#fffdf8]" />
        </div>
        <dl className="mt-12 grid grid-cols-3 gap-12 max-sm:grid-cols-1 max-sm:gap-6">
          {[
            ["Playlists", "Select an entire playlist."],
            ["Channels", "Capture dozens of videos in one batch."],
            ["Resumable", "Pause, resume and retry when something fails."],
          ].map(([term, description]) => (
            <div className="border-t-2 border-[#202124] pt-4" key={term}>
              <dt className="text-base font-extrabold">{term}</dt>
              <dd className="mt-2 ml-0 leading-relaxed text-[#64748b]">
                {description}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        className={`${pageWidth} grid grid-cols-[minmax(0,0.8fr)_minmax(560px,1.2fr)] items-center gap-[72px] py-32 max-lg:grid-cols-1 max-sm:gap-12 max-sm:py-[88px]`}
        id="local"
        aria-labelledby="local-title"
      >
        <div className="max-w-[720px]">
          <p className={eyebrow}>02 · Local-first</p>
          <h2
            className="m-0 text-[clamp(38px,5vw,64px)] leading-[1.02] font-bold tracking-[-0.04em] text-balance"
            id="local-title"
          >
            Your knowledge base lives on your computer.
          </h2>
          <p className="mt-5 mb-0 text-lg leading-[1.65] text-[#64748b]">
            Your local knowledge base doesn’t depend on a proprietary database.
            No account required. Just Markdown files you can keep forever.
          </p>
          <p className="mt-5 mb-0 text-[15px] leading-relaxed font-semibold text-[#202124]">
            Titles, source links, chapters and timestamps stay attached to the
            transcript.
          </p>
          <ul
            className="mt-6 flex list-none flex-wrap gap-2 p-0"
            aria-label="Works with text tools"
          >
            {[
              "Obsidian",
              "VS Code",
              "Codex",
              "Claude Code",
              "grep",
              "your scripts",
            ].map((tool) => (
              <li
                className="rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-xs text-[#64748b]"
                key={tool}
              >
                {tool}
              </li>
            ))}
          </ul>
          <code className="mt-6 block w-fit max-w-full overflow-x-auto rounded-lg bg-[#202124] px-4 py-3 text-[13px] text-white">
            rg &quot;reinforcement learning&quot; ~/youtube
          </code>
        </div>
        <div className="grid min-w-0 grid-cols-[190px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white max-sm:grid-cols-1">
          <div className="flex flex-col gap-2.5 border-r border-[#e2e8f0] bg-slate-50 p-5 font-mono text-[11px] leading-relaxed text-[#64748b] max-sm:border-r-0 max-sm:border-b">
            <strong className="text-[#202124]">youtube/</strong>
            <span>├─ AI Notes/</span>
            <span>│&nbsp;&nbsp;├─ Reliable AI Agents.md</span>
            <span>│&nbsp;&nbsp;└─ Context Engineering.md</span>
            <span>└─ Research Talks/</span>
          </div>
          <MarkdownDemo />
        </div>
      </section>

      <section
        className="border-y border-[#e2e8f0] bg-white px-[max(24px,calc((100%_-_1200px)/2))] py-28 max-sm:py-20"
        id="archive"
        aria-labelledby="archive-title"
      >
        <div className="mb-12 max-w-[860px]">
          <p className={eyebrow}>03 · Public archive</p>
          <h2
            className="m-0 text-[clamp(38px,5vw,64px)] leading-[1.02] font-bold tracking-[-0.04em] text-balance"
            id="archive-title"
          >
            Search transcripts on the web.
          </h2>
          <p className="mt-4 mb-0 text-sm font-bold text-[#0872b9]">
            Search · Read · Jump back to YouTube
          </p>
        </div>
        <form className="max-w-[760px]" action="/#archive" method="get">
          <label
            className="mb-2 block text-[13px] font-bold"
            htmlFor="archive-query"
          >
            Search the public archive
          </label>
          <div className="flex gap-2 max-sm:flex-col">
            <input
              className={`min-h-[52px] min-w-0 flex-1 rounded-xl border border-slate-400 bg-white px-4 py-3 text-[#202124] placeholder:text-[#64748b] ${focusRing}`}
              id="archive-query"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search words, names, or topics"
            />
            <button
              className={`min-h-[52px] rounded-xl border-0 bg-[#202124] px-5 py-3 font-bold text-white ${focusRing}`}
              type="submit"
            >
              Search
            </button>
          </div>
        </form>
        {query && search ? (
          <div className="mt-12" aria-live="polite">
            <div className="flex items-baseline justify-between gap-6">
              <h3 className="m-0 text-2xl font-bold">Results for “{query}”</h3>
              <a
                className={`font-bold text-[#0872b9] underline-offset-4 ${focusRing}`}
                href="/#archive"
              >
                Clear search
              </a>
            </div>
            {search.hits.length === 0 ? (
              <p className="mt-8 text-[#64748b]">
                No public transcript matches this search.
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {search.hits.map((hit) => (
                  <li className="border-t border-[#e2e8f0]" key={hit.key}>
                    <a
                      className={`grid grid-cols-[minmax(0,1fr)_180px] gap-x-6 gap-y-2 py-5 no-underline max-sm:grid-cols-1 ${focusRing}`}
                      href={`/videos/${hit.videoId}`}
                    >
                      <strong className="text-[17px]">{hit.title}</strong>
                      <span className="text-right text-[13px] font-bold text-[#0872b9] max-sm:text-left">
                        {hit.channelName}
                      </span>
                      <p className="col-span-full m-0 leading-relaxed text-[#64748b]">
                        {hit.window.find((segment) => segment.isHit)?.text}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : publicItems.length > 0 ? (
          <div className="mt-12 grid grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] gap-12 max-sm:grid-cols-1 max-sm:gap-6">
            <ul className="m-0 list-none p-0">
              {publicItems.map((item) => (
                <li className="border-t border-[#e2e8f0]" key={item.videoId}>
                  <a
                    className={`grid gap-1.5 py-5 no-underline hover:text-[#0872b9] ${focusRing}`}
                    href={`/videos/${item.videoId}`}
                  >
                    <span className="text-xs font-bold text-[#0872b9]">
                      {item.channelName}
                    </span>
                    <strong className="text-[17px]">{item.title}</strong>
                    <small className="text-[#64748b]">
                      {item.segmentCount} transcript segments
                    </small>
                  </a>
                </li>
              ))}
            </ul>
            <div className="self-start rounded-2xl border border-[#e2e8f0] bg-[#fffdf8] p-8">
              <span className="text-xs font-bold text-[#0872b9]">
                Public transcript
              </span>
              <h3 className="my-3 text-[28px] leading-tight font-bold tracking-[-0.03em]">
                {publicItems[0]?.title}
              </h3>
              <p className="leading-[1.65] text-[#64748b]">
                Open the complete server-rendered timeline, then use any
                timestamp to return to the exact moment on YouTube.
              </p>
              <a
                className={`font-bold text-[#0872b9] ${focusRing}`}
                href={`/videos/${publicItems[0]?.videoId}`}
              >
                Read transcript →
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-8 max-w-[760px] rounded-2xl border border-[#e2e8f0] bg-[#fffdf8] p-8 text-[#64748b]">
            <strong className="text-[#202124]">
              The public archive is waiting for its first transcript.
            </strong>
            <p className="mb-0 leading-relaxed">
              Search and reading appear here only after a signed-in user makes
              an explicit, complete public contribution.
            </p>
          </div>
        )}
        <p className="mt-10 mb-0 text-sm text-[#64748b]">
          Missing one? Contribute it to the public archive with Transcriptly.
          <a
            className={`font-bold text-[#0872b9] ${focusRing}`}
            href={CHROME_INSTALL_URL}
            rel="noreferrer"
            target="_blank"
          >
            {" "}
            Install the extension →
          </a>
        </p>
      </section>

      <aside
        className={`${pageWidth} my-20 flex items-center justify-between gap-8 rounded-2xl border border-[#202124] bg-[#fffdf8] px-8 py-7 max-sm:my-12 max-sm:flex-col max-sm:items-start max-sm:p-6`}
      >
        <div className="flex items-center gap-5 max-sm:items-start">
          <LogoMark size={40} />
          <p className="m-0 grid gap-1">
            <strong className="text-lg">Open source by default.</strong>
            <span className="text-[#64748b]">
              Inspect the code, self-host it, or build on top of it.
            </span>
          </p>
        </div>
        <a
          className={`font-bold whitespace-nowrap text-[#0872b9] ${focusRing}`}
          href={GITHUB_URL}
          rel="noreferrer"
          target="_blank"
        >
          View on GitHub →
        </a>
      </aside>
      <section
        className="grid justify-items-center border-t border-[#e2e8f0] bg-white px-6 py-28 text-center max-sm:py-20"
        aria-labelledby="final-title"
      >
        <h2
          className="m-0 max-w-[16ch] text-[clamp(38px,5vw,64px)] leading-[1.02] font-bold tracking-[-0.04em] text-balance"
          id="final-title"
        >
          Build your YouTube knowledge base.
        </h2>
        <p className="mt-5 mb-7 text-lg leading-[1.65] text-[#64748b]">
          One video or fifty. Keep every transcript as Markdown.
        </p>
        <CtaPair />
      </section>
      <footer
        className={`${pageWidth} grid min-h-24 grid-cols-[1fr_auto_1fr] items-center gap-6 text-[13px] text-[#64748b] max-sm:grid-cols-1 max-sm:py-8`}
      >
        <Brand />
        <p className="m-0">
          Local Markdown first. Public archive when you choose.
        </p>
        <a
          className={`justify-self-end font-bold text-[#0872b9] max-sm:justify-self-start ${focusRing}`}
          href={GITHUB_URL}
          rel="noreferrer"
          target="_blank"
        >
          Source code
        </a>
      </footer>
    </main>
  );
}
