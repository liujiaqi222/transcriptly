import { Layers, List, Play, RefreshCw } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import styles from "./landing-motion.module.css";

// Demo titles match across capture, batch manager, file tree, and Markdown.
const demoVideos = [
  ["Reliable AI Agents", "18:42"],
  ["Context Engineering", "32:08"],
  ["Workflow Evaluation", "24:16"],
] as const;

const thumbnails = [
  "from-[#3b2d63] to-[#6a4b9a]",
  "from-[#123a4a] to-[#1f6f8b]",
  "from-[#5a3a1a] to-[#b8781f]",
] as const;

/**
 * Hero demo: the extension running on a YouTube channel page, capturing
 * selected videos into local Markdown. The browser chrome and extension
 * panel read as one "Capture" story without a single YouTube trademark.
 */
export function CaptureDemo() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_32px_64px_-40px_rgba(32,33,36,0.35)]"
      role="img"
      aria-label="The Transcriptly extension running on a YouTube channel page: three videos are selected, a batch capture is running, and timestamped Markdown files are saved locally"
    >
      {/* Browser bar */}
      <div className="flex items-center gap-3 border-b border-[#e2e8f0] bg-[#f7f4ec] px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <i className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <i className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-3 py-1.5 font-mono text-[11px] text-[#64748b]">
          <span className="text-[#16a34a]" aria-hidden="true">
            ▾
          </span>
          <span className="truncate">youtube.com/@AInotes/videos</span>
        </span>
        <span className="hidden items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1.5 font-mono text-[10px] tracking-[0.08em] text-[#3c4043] uppercase sm:inline-flex">
          <span
            className={`${styles.liveDotVisible} h-1.5 w-1.5 rounded-full bg-[#f5c451]`}
            aria-hidden="true"
          />
          Transcriptly active
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.86fr)] max-sm:grid-cols-1">
        {/* YouTube side */}
        <div className="min-w-0 border-r border-[#e2e8f0] p-3.5 max-sm:border-r-0 max-sm:border-b">
          <div className="flex items-center gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#e05252] to-[#a83232] text-sm font-bold text-white"
              aria-hidden="true"
            >
              A
            </span>
            <div className="min-w-0">
              <p className="m-0 text-sm font-bold">AI Notes</p>
              <p className="m-0 font-mono text-[11px] text-[#64748b]">
                128K subscribers · 142 videos
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-4 border-b border-[#e2e8f0] font-mono text-[11px] text-[#64748b]">
            <span className="pb-2">Home</span>
            <span className="pb-2 font-bold text-[#202124] shadow-[inset_0_-2px_0_#f5c451]">
              Videos
            </span>
            <span className="pb-2">Playlists</span>
          </div>
          <ul className="m-0 mt-1 list-none p-0">
            {demoVideos.map(([title, duration], index) => {
              const checked = index < 2;
              return (
                <li
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2"
                  key={title}
                >
                  <span
                    className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-[5px] border-[1.5px] text-[10px] font-bold ${
                      checked
                        ? "border-[#f5c451] bg-[#f5c451] text-[#202124]"
                        : "border-slate-300 bg-white text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span
                    className={`relative h-11 w-20 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br ${thumbnails[index]}`}
                    aria-hidden="true"
                  >
                    <span className="absolute inset-0 grid place-items-center text-white/90">
                      <Play size={12} fill="currentColor" />
                    </span>
                    <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 font-mono text-[9px] text-white">
                      {duration}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-[#3c4043]">
                      {title}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-[#94a3b8]">
                      {index === 0
                        ? "2.1K views · 3 days ago"
                        : index === 1
                          ? "1.7K views · 1 week ago"
                          : "980 views · 2 weeks ago"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Extension panel */}
        <div className="flex min-w-0 flex-col bg-[#f7f4ec]">
          <div className="flex items-center gap-2 border-b border-[#e2e8f0] px-3.5 py-2.5">
            <LogoMark size={22} />
            <div className="leading-tight">
              <p className="m-0 text-[13px] font-bold">Transcriptly</p>
              <p className="m-0 font-mono text-[10px] tracking-[0.08em] text-[#64748b] uppercase">
                Capture
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 p-3.5">
            <span className="font-mono text-[11px] tracking-[0.1em] text-[#64748b] uppercase">
              AI Notes · Videos
            </span>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#64748b]">Selected</span>
              <span className="font-mono text-[13px] text-[#202124]">
                <strong className="font-bold text-[#202124]">37</strong> / 50
                videos
              </span>
            </div>
            <span className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#f5c451] px-4 py-2.5 text-sm font-bold text-[#202124]">
              Start capture
            </span>
            <div className="h-px bg-[#e2e8f0]" aria-hidden="true" />
            <div className="flex items-center justify-between font-mono text-[11px] text-[#64748b]">
              <span>Capturing…</span>
              <strong className="font-medium text-[#202124]">29 / 37</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
              <span
                className={`${styles.demoProgressVisible} block h-full w-[78%] origin-left rounded-full bg-[#1b90ed]`}
              />
            </div>
            <span className="mt-0.5 font-mono text-[11px] tracking-[0.1em] text-[#64748b] uppercase">
              Saving locally
            </span>
            <div className="grid gap-1.5 font-mono text-[11.5px] text-[#3c4043]">
              <span className="flex items-center gap-2">
                <span className="text-[#16a34a]" aria-hidden="true">
                  ✓
                </span>
                Reliable AI Agents.md
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[#16a34a]" aria-hidden="true">
                  ✓
                </span>
                Context Engineering.md
              </span>
              <span className="flex items-center gap-2 text-[#94a3b8]">
                <span aria-hidden="true">…</span>
                Workflow Evaluation.md
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Batch demo: the batch manager queue as one compact card - progress,
 * controls, and per-video state. The selection step is intentionally left to
 * the hero capture demo, so this stays a single glanceable panel.
 */
export function BatchQueueDemo() {
  const states = [
    ["Reliable AI Agents", "18:42", "captured", "bg-[#f5c451] text-[#202124]"],
    ["Context Engineering", "32:08", "running", "bg-[#edf7ff] text-[#0872b9]"],
    ["Workflow Evaluation", "24:16", "queued", "bg-slate-100 text-[#64748b]"],
    ["Memory Systems", "29:53", "failed", "bg-red-50 text-red-700"],
  ] as const;

  return (
    <div
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_32px_64px_-48px_rgba(32,33,36,0.35)]"
      role="img"
      aria-label="The batch manager capturing a 37-video playlist: 29 done, one video running, one queued, one failed, with pause, resume, and retry controls"
    >
      <div className="flex items-center justify-between gap-3 bg-[#202124] px-5 py-3.5 text-sm text-white">
        <span className="flex items-center gap-2 font-bold">
          <span
            className={`${styles.liveDotVisible} h-2 w-2 rounded-full bg-[#f5c451]`}
            aria-hidden="true"
          />
          Batch Manager
        </span>
        <span className="font-mono text-xs tracking-[0.06em] text-white/60">
          PLAYLIST / 37 VIDEOS
        </span>
      </div>
      <div className="p-5">
        <div className="mb-3 flex justify-between font-mono text-xs text-[#64748b]">
          <span>Capturing videos…</span>
          <span className="font-bold text-[#202124] tabular-nums">
            29 / 37 done
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]"
          role="progressbar"
          aria-label="29 of 37 videos done"
          aria-valuemin={0}
          aria-valuemax={37}
          aria-valuenow={29}
        >
          <span
            className={`${styles.demoProgressVisible} block h-full w-[78%] origin-left rounded-full bg-[#1b90ed]`}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["Pause", "Resume", "Retry failed"].map((label) => (
            <span
              className="inline-flex min-h-8 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 font-mono text-[11px] font-medium"
              key={label}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {states.map(([title, duration, state, colors]) => {
          const captured = state === "captured";
          return (
            <li
              className="flex min-h-11 items-center gap-3 border-t border-[#e2e8f0] px-5 text-xs"
              key={title}
            >
              <span
                className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-[5px] border-[1.5px] font-mono text-[10px] font-bold ${
                  captured
                    ? "border-[#f5c451] bg-[#f5c451] text-[#202124]"
                    : "border-slate-300 bg-white text-transparent"
                }`}
                aria-hidden="true"
              >
                ✓
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {title}
              </span>
              <span
                className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold tracking-[0.06em] uppercase ${colors}`}
              >
                {state}
              </span>
              <span className="font-mono text-[#94a3b8] tabular-nums">
                {duration}
              </span>
            </li>
          );
        })}
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
