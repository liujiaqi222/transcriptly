import { FileText } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import { LocalKnowledgeDemo } from "./local-knowledge-demo";
import {
  BatchCapabilities,
  BatchWorkflowDemo,
  HeroWorkflowDemo,
} from "./product-demos";
import {
  Brand,
  CtaPair,
  eyebrow,
  focusRing,
  GITHUB_URL,
  pageWidth,
  SectionHeading,
} from "./shared";

export function LandingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-[#e2e8f0] bg-[#fffdf8]">
      <div
        className={`${pageWidth} flex min-h-[72px] items-center gap-8 max-sm:min-h-16 max-sm:gap-3`}
      >
        <Brand />
        <nav
          aria-label="Account"
          className="ml-auto flex items-center gap-6 max-sm:gap-4"
        >
          <a
            className={`text-sm font-bold text-[#0872b9] underline-offset-4 hover:underline ${focusRing}`}
            href={
              signedIn
                ? "/contributions"
                : "/sign-in?callbackURL=%2Fcontributions"
            }
          >
            {signedIn ? "My contributions" : "Sign in"}
          </a>
          <CtaPair compact />
        </nav>
      </div>
    </header>
  );
}

export function HeroSection() {
  return (
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
      <HeroWorkflowDemo />
    </section>
  );
}

export function BatchSection() {
  return (
    <section
      className="border-y border-[#e2e8f0] bg-white px-[max(24px,calc((100%_-_1200px)/2))] py-28 max-sm:py-20"
      id="batch"
      aria-labelledby="batch-title"
    >
      <SectionHeading
        id="batch-title"
        index="01"
        label="Batch"
        title="Capture channels, not just videos."
        copy="Stop saving transcripts one video at a time."
      />
      <BatchWorkflowDemo />
      <BatchCapabilities />
    </section>
  );
}

const tools = [
  "Obsidian",
  "VS Code",
  "Codex",
  "Claude Code",
  "grep",
  "your scripts",
];

export function LocalFirstSection() {
  return (
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
          Your local knowledge base doesn’t depend on a proprietary database. No
          account required. Just Markdown files you can keep forever.
        </p>
        <p className="mt-5 mb-0 text-[15px] leading-relaxed font-semibold text-[#202124]">
          Titles, source links, chapters and timestamps stay attached to the
          transcript.
        </p>
        <div className="mt-6 flex gap-3 border-l-4 border-[#1b90ed] bg-white py-4 pr-4 pl-4">
          <FileText
            className="mt-0.5 shrink-0 text-[#202124]"
            size={20}
            aria-hidden="true"
          />
          <p className="m-0 grid gap-1 text-sm leading-relaxed">
            <strong>Plain Markdown, no export step.</strong>
            <span className="text-[#64748b]">
              The folder itself is your knowledge base. Open it with the tools
              you already use.
            </span>
          </p>
        </div>
        <ul
          className="mt-5 flex list-none flex-wrap gap-2 p-0"
          aria-label="Works with text tools"
        >
          {tools.map((tool) => (
            <li
              className="rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-xs text-[#64748b]"
              key={tool}
            >
              {tool}
            </li>
          ))}
        </ul>
      </div>
      <LocalKnowledgeDemo />
    </section>
  );
}

export function OpenSourceStrip() {
  return (
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
  );
}

export function FinalCtaSection() {
  return (
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
  );
}

export function LandingFooter() {
  return (
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
  );
}
