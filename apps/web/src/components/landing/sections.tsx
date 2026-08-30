import { LogoMark } from "@/components/logo-mark";
import { LocalKnowledgeDemo } from "./local-knowledge-demo";
import { MotionReveal } from "./motion-reveal";
import {
  BatchCapabilities,
  BatchQueueDemo,
  CaptureDemo,
} from "./product-demos";
import {
  Brand,
  CtaPair,
  displayFace,
  focusRing,
  GITHUB_URL,
  monoLabel,
  pageWidth,
  SectionHeading,
  SectionKicker,
} from "./shared";

/** Signed-in identity, rendered as the account entry; null when signed out. */
export function LandingHeader({
  user,
}: {
  user: { name: string; image: string | null } | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[#e2e8f0] bg-[#fffdf8]/90 backdrop-blur-sm">
      <div
        className={`${pageWidth} flex min-h-16 items-center gap-8 max-sm:gap-3`}
      >
        <Brand />
        <nav
          aria-label="Primary"
          className="ml-4 hidden items-center gap-6 lg:flex"
        >
          <a
            className={`text-sm font-medium text-[#64748b] hover:text-[#202124] ${focusRing}`}
            href="#capture"
          >
            Capture
          </a>
          <a
            className={`text-sm font-medium text-[#64748b] hover:text-[#202124] ${focusRing}`}
            href="#batch"
          >
            Batch
          </a>
          <a
            className={`text-sm font-medium text-[#64748b] hover:text-[#202124] ${focusRing}`}
            href="#local"
          >
            Local Markdown
          </a>
          <a
            className={`text-sm font-medium text-[#64748b] hover:text-[#202124] ${focusRing}`}
            href="#archive"
          >
            Archive
          </a>
        </nav>
        <nav
          className="ml-auto flex items-center gap-5 max-sm:gap-3"
          aria-label="Account"
        >
          {user ? (
            <a
              aria-label="My contributions"
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border border-[#e2e8f0] bg-white py-1 pr-3 pl-1 text-sm font-bold text-[#202124] transition-colors hover:border-[#cbd5e1] ${focusRing}`}
              href="/contributions"
            >
              {user.image ? (
                // biome-ignore lint/performance/noImgElement: remote account avatar, not page imagery.
                <img
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                  height="32"
                  referrerPolicy="no-referrer"
                  src={user.image}
                  width="32"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-full bg-[#edf7ff] text-sm font-bold text-[#0872b9]"
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="max-w-[20ch] truncate max-sm:hidden">
                {user.name}
              </span>
            </a>
          ) : (
            <a
              className={`text-sm font-bold text-[#0872b9] underline-offset-4 hover:underline ${focusRing}`}
              href="/sign-in?callbackURL=%2Fcontributions"
            >
              Sign in
            </a>
          )}
          <CtaPair compact />
        </nav>
      </div>
    </header>
  );
}

/** The Capture beat: one video becomes a local Markdown file. */
export function HeroSection() {
  return (
    <section
      className={`${pageWidth} grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-14 py-18 max-lg:grid-cols-1 max-lg:py-14 max-sm:gap-10 max-sm:py-10`}
      id="capture"
      aria-labelledby="hero-title"
    >
      <div className="max-w-160">
        <p
          className={`mb-5 inline-flex items-center gap-3 ${monoLabel} text-[#64748b]`}
        >
          <span
            className="h-2 w-2 rounded-full bg-[#f5c451] shadow-[0_0_12px_1px_rgba(245,196,81,0.7)]"
            aria-hidden="true"
          />
          01 · Capture
        </p>
        <h1
          className={`${displayFace} m-0 text-[clamp(46px,5.4vw,76px)] leading-[0.98]`}
          id="hero-title"
        >
          Turn YouTube into{" "}
          <em className="italic text-[#0872b9]">a knowledge base.</em>
        </h1>
        <p className="my-7 max-w-[52ch] text-lg leading-[1.65] text-[#64748b] max-sm:text-base">
          Capture a video, a playlist, or an entire channel as timestamped
          Markdown. Everything stays on your computer — searchable, portable,
          and yours.
        </p>
        <CtaPair />
        <p className="mt-5 mb-0 flex flex-wrap gap-x-3 gap-y-2 font-mono text-xs text-[#64748b]">
          <span className="text-[#16a34a]" aria-hidden="true">
            ✓
          </span>
          No account required
          <span className="text-[#94a3b8]" aria-hidden="true">
            ·
          </span>
          Plain Markdown
          <span className="text-[#94a3b8]" aria-hidden="true">
            ·
          </span>
          Open source
        </p>
      </div>
      <CaptureDemo />
    </section>
  );
}

const marqueeItems = [
  "Playlists",
  "Channels",
  "Timestamped",
  "Plain Markdown",
  "Local-first",
  "Open source",
  "Resumable",
  "No account",
] as const;

export function Marquee() {
  const half = marqueeItems.map((item) => (
    <span
      className={`flex items-center gap-10 ${monoLabel} text-[#64748b]`}
      key={item}
    >
      {item}
      <span className="h-1.5 w-1.5 rounded-full bg-[#f5c451]" />
    </span>
  ));

  return (
    <div
      className="overflow-hidden border-y border-[#e2e8f0] bg-[#f7f4ec] py-4"
      aria-hidden="true"
    >
      <div className="marquee-track flex w-max items-center">
        <div className="flex shrink-0 items-center gap-10 pr-10">{half}</div>
        <div className="flex shrink-0 items-center gap-10 pr-10">{half}</div>
      </div>
    </div>
  );
}

export function BatchSection() {
  return (
    <section
      className="px-[max(24px,calc((100%-1200px)/2))] py-24 max-sm:py-16"
      id="batch"
      aria-labelledby="batch-title"
    >
      <div className={pageWidth}>
        <SectionHeading
          id="batch-title"
          index="02"
          label="Batch"
          title={
            <>
              Capture channels, <em className="italic">not just videos.</em>
            </>
          }
          copy="Stop saving transcripts one video at a time. Select a whole playlist or channel once, and let Transcriptly handle the rest."
        />
        <div className="grid grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] items-center gap-14 max-lg:grid-cols-1 max-lg:gap-12 max-sm:gap-10">
          <MotionReveal>
            <BatchCapabilities />
          </MotionReveal>
          <MotionReveal delay={160}>
            <BatchQueueDemo />
          </MotionReveal>
        </div>
      </div>
    </section>
  );
}

export function LocalMarkdownSection() {
  return (
    <section
      className="border-t border-[#e2e8f0]"
      id="local"
      aria-labelledby="local-title"
    >
      <div
        className={`${pageWidth} grid grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] gap-14 py-24 max-lg:grid-cols-1 max-sm:gap-10 max-sm:py-16`}
      >
        <div className="max-w-180">
          <SectionKicker index="03" label="Local Markdown" />
          <h2
            className={`${displayFace} m-0 text-[clamp(34px,4.6vw,56px)] leading-[1.02]`}
            id="local-title"
          >
            Your knowledge base lives{" "}
            <em className="italic">on your computer.</em>
          </h2>
          <p className="mt-5 mb-0 max-w-[52ch] text-lg leading-[1.65] text-[#64748b]">
            No proprietary database. No account required. Just Markdown files
            you can keep forever — every line timestamped back to the exact
            moment on YouTube.
          </p>
          <ul className="mt-8 mb-0 list-none space-y-4 p-0">
            <li className="rounded-r-xl border-l-3 border-[#f5c451] bg-[#f7f4ec] py-3 pr-4 pl-4">
              <span className={`${monoLabel} block text-[#64748b]`}>.md</span>
              <p className="m-0 mt-1 text-sm leading-relaxed text-[#3c4043]">
                <strong className="text-[#202124]">No export step.</strong> Your
                folder is the knowledge base — open it in Obsidian, VS Code, or
                any text tool.
              </p>
            </li>
            <li className="rounded-r-xl border-l-3 border-[#f5c451] bg-[#f7f4ec] py-3 pr-4 pl-4">
              <span className={`${monoLabel} block text-[#64748b]`}>
                Searchable
              </span>
              <p className="m-0 mt-1 text-sm leading-relaxed text-[#3c4043]">
                Grep it, index it, sync it. Your notes play well with the tools
                you already use.
              </p>
            </li>
          </ul>
        </div>
        <LocalKnowledgeDemo />
      </div>
    </section>
  );
}

export function OpenSourceStrip() {
  return (
    <aside
      className={`${pageWidth} my-16 flex items-center justify-between gap-8 rounded-2xl border border-[#202124] bg-[#fffdf8] px-8 py-7 max-sm:my-10 max-sm:flex-col max-sm:items-start max-sm:p-6`}
    >
      <div className="flex items-center gap-5 max-sm:items-start">
        <LogoMark size={40} />
        <p className="m-0 grid gap-1">
          <strong className={`${displayFace} text-xl`}>
            Open source by default.
          </strong>
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
  );
}

export function FinalCtaSection() {
  return (
    <section
      className="grid justify-items-center border-t border-[#e2e8f0] bg-white px-6 py-32 text-center max-sm:py-24"
      aria-labelledby="final-title"
    >
      <h2
        className={`${displayFace} m-0 max-w-[18ch] text-[clamp(42px,6.4vw,88px)] leading-[0.98]`}
        id="final-title"
      >
        Build your YouTube{" "}
        <em className="italic text-[#0872b9]">knowledge base.</em>
      </h2>
      <p className="mt-6 mb-10 max-w-[48ch] text-xl leading-[1.6] text-[#64748b]">
        One video or fifty. Keep every transcript as Markdown.
      </p>
      <CtaPair />
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer
      className={`${pageWidth} grid min-h-24 grid-cols-[1fr_auto_1fr] items-center gap-6 text-sm text-[#64748b] max-sm:grid-cols-1 max-sm:py-8`}
    >
      <Brand />
      <p className="m-0">
        Local Markdown first. Public archive when you choose.
      </p>
      <div className="flex items-center justify-end gap-6 justify-self-end max-sm:justify-start">
        <a className={`font-bold text-[#0872b9] ${focusRing}`} href="/privacy">
          Privacy Policy
        </a>
        <a
          className={`font-bold text-[#0872b9] ${focusRing}`}
          href={GITHUB_URL}
          rel="noreferrer"
          target="_blank"
        >
          Source code
        </a>
      </div>
    </footer>
  );
}
