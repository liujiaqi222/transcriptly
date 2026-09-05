import {
  Copy,
  Folder,
  Layers,
  List,
  Pause,
  RefreshCw,
  RotateCw,
  X,
} from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import styles from "./landing-motion.module.css";

const heroSegments = [
  ["00:00", "Before you add tools, define the outcome you want."],
  ["01:04", "A reliable agent makes progress visible at every step."],
  ["02:18", "Start with observable behavior, not hidden reasoning."],
  ["03:47", "Small, deterministic workflows beat large clever ones."],
] as const;

/**
 * Hero demo: the real extension popup, rendered faithfully at true width
 * (360px). Every region mirrors the actual product — brand header, file
 * name field, timestamped transcript preview, save footer with the yellow
 * CTA — instead of an invented browser mockup.
 */
export function CaptureDemo() {
  return (
    <figure className="m-0 flex w-full flex-col items-center">
      <div
        className="flex w-full max-w-[360px] flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_24px_48px_-32px_rgba(32,33,36,0.28)]"
        role="img"
        aria-label="The Transcriptly extension popup on a YouTube video: the transcript is captured with timestamps, the file is named reliable-ai-agents.md, and the Save button writes it to a local folder"
      >
        {/* Popup header — mirrors the real brand lockup */}
        <div className="flex min-h-14 items-center gap-2 border-b border-[#e2e8f0] px-3 py-2">
          <LogoMark size={28} />
          <span className="text-[15px] font-bold tracking-[-0.01em] text-[#202124]">
            Transcriptly
          </span>
        </div>

        {/* Capture meta — video title, file name */}
        <div className="grid gap-3 px-4 pt-3 pb-0">
          <div className="min-w-0">
            <p className="m-0 text-[17px] leading-[1.25] font-bold tracking-[-0.02em] text-[#202124]">
              Reliable AI Agents
            </p>
            <p className="m-0 mt-1 font-mono text-[11px] text-[#64748b]">
              AI Notes · 18:42 · 182 segments
            </p>
          </div>
          <div className="grid gap-1.5">
            <span
              className="text-[11px] font-semibold text-[#64748b]"
              aria-hidden="true"
            >
              File name
            </span>
            <div className="flex gap-2">
              <span className="flex min-h-10 min-w-0 flex-1 items-center truncate rounded-[9px] border border-[#e2e8f0] px-3 py-2 font-mono text-[13px] text-[#202124]">
                reliable-ai-agents.md
              </span>
              <span className="grid min-h-10 w-[88px] shrink-0 place-items-center rounded-[9px] border border-[#e2e8f0] px-2.5 text-xs font-semibold text-[#64748b]">
                Details
              </span>
            </div>
          </div>
        </div>

        {/* Transcript preview — timestamped segments like the saved file */}
        <div className="grid gap-1.5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] font-medium tracking-[0.07em] text-[#64748b] uppercase">
              Transcript
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e2e8f0] px-2 py-1 text-[11px] font-medium text-[#64748b]">
              <Copy size={12} aria-hidden="true" />
              Copy
            </span>
          </div>
          <div className="relative overflow-hidden">
            <div className="grid gap-1.5 text-[13px] leading-[1.55] text-[#3c4043]">
              {heroSegments.map(([timestamp, text]) => (
                <p className="m-0" key={timestamp}>
                  <span className="mr-1 font-mono text-[12px] font-semibold text-[#0872b9] tabular-nums">
                    [{timestamp}]
                  </span>
                  {text}
                </p>
              ))}
              <p className="m-0 text-[#94a3b8]">…</p>
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-white"
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Save footer — folder destination and the yellow CTA */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#e2e8f0] px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-xs">
            <Folder
              className="shrink-0 text-[#64748b]"
              size={16}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block font-semibold text-[#202124]">
                Local Markdown
              </span>
              <span className="block truncate font-mono text-[11px] text-[#64748b]">
                ~/youtube/AI-Notes
              </span>
            </span>
          </span>
          <span className="grid min-h-10 shrink-0 place-items-center rounded-[9px] bg-[#f5c451] px-4 text-sm font-bold text-[#202124]">
            Save
          </span>
        </div>
      </div>
      <figcaption className="mt-3 font-mono text-[11px] text-[#94a3b8]">
        the extension popup · on any YouTube watch page
      </figcaption>
    </figure>
  );
}

/**
 * Batch demo: the real batch manager page — state pill, progress with
 * summary, Pause / Stop controls, and per-video results with the same
 * `local: saved` chips as the product. No invented dashboard chrome.
 */
export function BatchQueueDemo() {
  const items = [
    { title: "Reliable AI Agents", videoId: "aBcDeFg1234", state: "saved" },
    { title: "Context Engineering", videoId: "xYzWvu9876", state: "running" },
    { title: "Workflow Evaluation", videoId: "qRsTuv4321", state: "queued" },
    { title: "Memory Systems", videoId: "mNoPqr5678", state: "failed" },
  ] as const;

  const chipColors: Record<(typeof items)[number]["state"], string> = {
    saved: "bg-[#f0fdf4] text-[#15803d]",
    running: "bg-[#edf7ff] text-[#0872b9]",
    queued: "bg-slate-100 text-[#64748b]",
    failed: "bg-[#fef2f2] text-[#b91c1c]",
  };

  return (
    <div
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_24px_48px_-32px_rgba(32,33,36,0.28)]"
      role="img"
      aria-label="The batch manager page capturing a 37-video playlist: 29 done with one failure and about 14 minutes remaining, with Pause and Stop controls and per-video results"
    >
      {/* Page header — mirrors the real manager bar */}
      <div className="flex min-h-14 items-center gap-2 border-b border-[#e2e8f0] px-5 py-2">
        <LogoMark size={24} />
        <span className="text-[15px] font-bold tracking-[-0.01em] text-[#202124]">
          Transcriptly batch
        </span>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#edf7ff] px-2 py-1 text-xs font-semibold text-[#0872b9]">
            Running
          </span>
          <span className="font-mono text-xs text-[#64748b]">
            8/26/2026, 2:32 PM
          </span>
          <span className="font-mono text-xs text-[#64748b]">local</span>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-[#e2e8f0]"
          role="progressbar"
          aria-label="29 of 37 videos done"
          aria-valuemin={0}
          aria-valuemax={37}
          aria-valuenow={29}
        >
          <span
            className={`${styles.demoProgressVisible} block h-full w-[78%] origin-left rounded-full bg-[#15803d]`}
          />
        </div>
        <p className="m-0 mt-3 text-sm font-semibold text-[#202124] tabular-nums">
          29/37 done · 1 failed · ~14 min remaining
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#e2e8f0] px-3 text-sm text-[#3c4043]">
            <Pause size={15} aria-hidden="true" />
            Pause
          </span>
          <span className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#fecaca] px-3 text-sm text-[#b91c1c]">
            <X size={15} aria-hidden="true" />
            Stop pending items
          </span>
        </div>
      </div>

      <ul className="m-0 list-none p-0">
        {items.map(({ title, videoId, state }) => (
          <li
            className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#e2e8f0] px-5 py-3"
            key={videoId}
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0872b9]">
              {title}
            </span>
            <span className="font-mono text-[11px] text-[#64748b]">
              {videoId}
            </span>
            <span
              className={`rounded-full px-2 py-1 font-mono text-[11px] font-semibold ${chipColors[state]}`}
            >
              local: {state}
            </span>
            {state === "failed" && (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[#e2e8f0] px-2.5 text-xs text-[#3c4043]">
                <RotateCw size={12} aria-hidden="true" />
                Retry
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const batchCapabilities = [
  {
    title: "Playlists",
    description: "Capture the whole playlist in one pass.",
    proof: ["One selection", "No video limit"],
    Icon: List,
  },
  {
    title: "Channels",
    description: "Choose dozens from a channel’s Videos tab.",
    proof: ["Load more", "Select all"],
    Icon: Layers,
  },
  {
    title: "Resumable",
    description: "Recover failed work without starting over.",
    proof: ["Pause", "Resume", "Retry failed"],
    Icon: RefreshCw,
  },
] as const;

export function BatchCapabilities() {
  return (
    <dl className="m-0 grid gap-8 max-sm:gap-6">
      {batchCapabilities.map(({ title, description, proof, Icon }) => (
        <div className="flex min-w-0 gap-4" key={title}>
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#e2e8f0] bg-[#f7f4ec] text-[#202124]"
            aria-hidden="true"
          >
            <Icon size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <dt className="text-base font-bold">{title}</dt>
            <dd className="mt-1.5 ml-0 text-sm leading-relaxed text-[#64748b]">
              {description}
            </dd>
            <dd className="mt-3 ml-0 flex flex-wrap gap-2">
              {proof.map((detail) => (
                <span
                  className="rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 font-mono text-[11px] font-medium text-[#64748b]"
                  key={detail}
                >
                  {detail}
                </span>
              ))}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
