import {
  ArrowRight,
  Check,
  Layers,
  List,
  ListVideo,
  Play,
  RefreshCw,
} from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import styles from "./landing-motion.module.css";
import { MotionReveal } from "./motion-reveal";

// Demo titles match across selection, batch manager, file tree, and Markdown.
const demoVideos = [
  ["Reliable AI Agents", "18:42"],
  ["Context Engineering", "32:08"],
  ["Workflow Evaluation", "24:16"],
] as const;

function DemoCheck({ index, animated }: { index: number; animated: boolean }) {
  return (
    <span
      className="relative grid h-[18px] w-[18px] place-items-center rounded-[5px] border-[1.5px] border-slate-300 bg-white"
      aria-hidden="true"
    >
      <span
        className={`absolute inset-[-1.5px] grid place-items-center rounded-[5px] bg-[#1b90ed] text-white ${animated ? styles.demoCheckVisible : ""}`}
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
      className={`flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border ${surface}`}
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
        <span className="ml-auto inline-flex min-h-9 items-center justify-center rounded-lg bg-[#f5c451] px-3 py-2 text-[11px] font-bold leading-none text-[#202124]">
          Start batch
        </span>
      </div>
    </div>
  );
}

function SourcePreview() {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white">
      <div className="flex items-center gap-2 border-b border-[#e2e8f0] bg-[#fffdf8] px-3 py-2 text-xs font-bold text-[#202124]">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#edf7ff] text-[#0872b9]">
          <Play size={10} fill="currentColor" aria-hidden="true" />
        </span>
        <span className="truncate">AI Notes</span>
        <span className="ml-auto text-[10px] font-bold tracking-[0.08em] text-[#0872b9]">
          CHANNEL
        </span>
      </div>
      <div className="border-b border-[#e2e8f0] px-4 py-3">
        <p className="m-0 text-[10px] font-bold tracking-[0.12em] text-[#0872b9] uppercase">
          New videos
        </p>
        <h3 className="mt-1 mb-0 text-sm font-extrabold tracking-[-0.02em]">
          AI Notes
        </h3>
      </div>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-b border-[#e2e8f0] p-3">
        <div className="grid h-12 place-items-center rounded-lg bg-slate-100 text-slate-400">
          <Play size={18} fill="currentColor" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <strong className="block overflow-hidden text-xs text-ellipsis whitespace-nowrap">
            Reliable AI Agents
          </strong>
          <span className="mt-1 block text-[10px] text-[#64748b]">
            18:42 · just published
          </span>
        </div>
      </div>
      <div className="flex min-h-9 items-center gap-2 px-3 py-2 text-[10px] leading-none font-bold text-[#64748b]">
        <ListVideo size={13} aria-hidden="true" />
        <span>2 more videos ready to capture</span>
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
    <div
      className={`flex h-full min-w-0 flex-col rounded-2xl border ${surface} p-5`}
    >
      <div className="-mx-5 -mt-5 mb-5 flex items-center justify-between gap-3 rounded-t-2xl bg-[#202124] px-5 py-4 text-[13px] text-white">
        <span className="flex items-center gap-2 font-bold">
          <span
            className={`${styles.liveDotVisible} h-2 w-2 rounded-full bg-[#f5c451]`}
            aria-hidden="true"
          />
          Batch Manager
        </span>
        <strong className="text-[#f5c451] tabular-nums">29 / 37 done</strong>
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
          <span
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-[11px] leading-none font-semibold"
            key={label}
          >
            {label}
          </span>
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

export function HeroWorkflowDemo() {
  return (
    <div
      className="grid select-none grid-cols-[minmax(0,1.2fr)_28px_minmax(0,1fr)_28px_minmax(0,1fr)] items-stretch max-sm:grid-cols-1 max-sm:gap-3"
      role="img"
      aria-label="Workflow demonstration: start from an AI Notes channel, capture videos as transcripts, and save them as Markdown files on your computer"
    >
      <div className="flex min-h-[276px] min-w-0 flex-col max-sm:min-h-0">
        <span className="mb-2 block min-h-4 text-[11px] leading-4 font-bold tracking-[0.06em] text-[#64748b] uppercase">
          YouTube
        </span>
        <SourcePreview />
      </div>
      <DemoArrow />
      <div className="flex min-h-[276px] min-w-0 flex-col max-sm:min-h-0">
        <span className="mb-2 block min-h-4 text-[11px] leading-4 font-bold tracking-[0.06em] text-[#64748b] uppercase">
          Capture
        </span>
        <div className="flex h-full min-w-0 flex-1 flex-col justify-center rounded-2xl border border-[#e2e8f0] bg-white p-4 max-sm:min-h-44">
          <LogoMark size={24} />
          <strong className="mt-5 text-[12px] tabular-nums">
            <span className="inline-grid">
              <span
                className={`${styles.demoCountFirstVisible} col-start-1 row-start-1`}
              >
                Capturing 29 / 37
              </span>
              <span
                className={`${styles.demoCountNextVisible} col-start-1 row-start-1 opacity-0`}
                style={{ animationDelay: "3s" }}
              >
                Capturing 30 / 37
              </span>
              <span
                className={`${styles.demoCountNextVisible} col-start-1 row-start-1 opacity-0`}
                style={{ animationDelay: "6s" }}
              >
                Capturing 31 / 37
              </span>
            </span>
          </strong>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e2e8f0]">
            <span
              className={`${styles.demoProgressVisible} block h-full w-[78%] origin-left rounded-full bg-[#1b90ed]`}
            />
          </div>
          <small className="mt-3 text-[10px] leading-snug text-[#64748b]">
            Saving Markdown locally…
          </small>
        </div>
      </div>
      <DemoArrow />
      <div className="flex min-h-[276px] min-w-0 flex-col max-sm:min-h-0">
        <span className="mb-2 block min-h-4 text-[11px] leading-4 font-bold tracking-[0.06em] text-[#64748b] uppercase">
          Markdown
        </span>
        <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-2 rounded-2xl border border-[#e2e8f0] bg-white p-4 font-mono text-[10px] leading-snug text-[#64748b] max-sm:min-h-44">
          <strong className="text-[#202124]">youtube/AI Notes</strong>
          <span
            className={styles.demoFileLineVisible}
            style={{ animationDelay: "2.6s" }}
          >
            ├─ Reliable AI Agents.md
          </span>
          <span
            className={styles.demoFileLineVisible}
            style={{ animationDelay: "2.9s" }}
          >
            ├─ Context Engineering.md
          </span>
          <span
            className={styles.demoFileLineVisible}
            style={{ animationDelay: "3.2s" }}
          >
            └─ Workflow Evaluation.md
          </span>
        </div>
      </div>
    </div>
  );
}

export function BatchWorkflowDemo() {
  return (
    <MotionReveal
      className="overflow-hidden border-y border-[#202124] bg-[#fffdf8]"
      role="img"
      ariaLabel="Batch demonstration: select 37 of 50 playlist videos, then watch the batch manager capture them with pause, resume, and retry controls"
    >
      <MotionReveal
        className="flex items-center justify-between gap-4 border-b border-[#e2e8f0] px-5 py-4 max-sm:items-start max-sm:flex-col"
        delay={120}
      >
        <div>
          <p className="m-0 text-[11px] font-bold tracking-[0.14em] text-[#0872b9] uppercase">
            One queue, every video
          </p>
          <p className="mt-1 mb-0 text-sm text-[#64748b]">
            Select once. Transcriptly handles the rest.
          </p>
        </div>
        <span className="font-mono text-[11px] font-bold text-[#64748b]">
          PLAYLIST / 37 VIDEOS
        </span>
      </MotionReveal>
      <div className="grid select-none grid-cols-[minmax(0,1.12fr)_48px_minmax(340px,0.88fr)] items-stretch gap-2 p-5 max-lg:grid-cols-1 max-lg:gap-6 max-sm:p-4">
        <MotionReveal className="h-full min-w-0" delay={240}>
          <SelectionDemo surface="border-[#e2e8f0] bg-white" />
        </MotionReveal>
        <DemoArrow />
        <MotionReveal className="h-full min-w-0" delay={380}>
          <BatchManagerDemo surface="border-[#e2e8f0] bg-white" />
        </MotionReveal>
      </div>
    </MotionReveal>
  );
}

const batchCapabilities = [
  {
    title: "Playlists",
    description: "Capture the whole playlist in one pass.",
    proof: ["One selection", "Up to 50 videos"],
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
    <dl className="mt-12 grid grid-cols-3 border-y border-[#202124] bg-[#fffdf8] max-sm:grid-cols-1">
      {batchCapabilities.map(({ title, description, proof, Icon }) => (
        <div
          className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-4 border-l border-[#e2e8f0] px-6 py-7 first:border-l-0 max-sm:border-t max-sm:border-l-0 max-sm:px-0 max-sm:first:border-t-0"
          key={title}
        >
          <span
            className="grid h-10 w-10 place-items-center rounded-xl border border-[#e2e8f0] bg-[#fffdf8] text-[#202124]"
            aria-hidden="true"
          >
            <Icon size={20} strokeWidth={2} />
          </span>
          <div>
            <dt className="text-base font-extrabold">{title}</dt>
            <dd className="mt-2 ml-0 leading-relaxed text-[#64748b]">
              {description}
            </dd>
            <dd className="mt-3 ml-0 flex flex-wrap gap-2">
              {proof.map((detail) => (
                <span
                  className="rounded-full border border-[#e2e8f0] bg-white px-2 py-1 text-[10px] font-bold text-[#64748b]"
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
