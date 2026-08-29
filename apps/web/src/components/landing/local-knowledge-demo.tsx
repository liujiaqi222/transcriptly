import { FileText, Folder } from "lucide-react";
import { MotionReveal } from "./motion-reveal";

function FileTreeRow({
  children,
  depth = 0,
  file = false,
  active = false,
}: {
  children: string;
  depth?: number;
  file?: boolean;
  active?: boolean;
}) {
  const Icon = file ? FileText : Folder;
  return (
    <span
      className={`flex min-w-0 items-center gap-2 whitespace-nowrap ${
        active ? "text-[#f5c451]" : ""
      }`}
      style={{ paddingLeft: depth * 16 }}
      title={children}
    >
      <Icon className="shrink-0" size={14} aria-hidden="true" />
      <span className="overflow-hidden text-ellipsis">{children}</span>
    </span>
  );
}

/**
 * Local Markdown demo: a folder tree beside the open transcript file, with
 * timestamps and frontmatter rendered in JetBrains Mono like the real output.
 */
export function LocalKnowledgeDemo() {
  return (
    <div
      className="grid h-full min-w-0 grid-cols-[minmax(0,220px)_minmax(0,1fr)] select-none overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white max-sm:grid-cols-1"
      role="img"
      aria-label="A Markdown transcript file with frontmatter and timestamped lines, open beside a local folder tree of channel folders and transcript files"
    >
      <div className="flex min-w-0 flex-col overflow-hidden border-r border-[#e2e8f0] bg-[#f7f4ec] max-sm:hidden">
        <div className="flex items-center border-b border-[#e2e8f0] bg-[#f7f4ec] px-4 py-2.5 font-mono text-xs">
          <span className="font-medium text-[#64748b]">EXPLORER</span>
          <span className="ml-auto text-[#0872b9]">~/youtube</span>
        </div>
        <MotionReveal
          className="flex min-w-0 flex-col gap-2.5 p-4 font-mono text-xs leading-relaxed text-[#64748b]"
          delay={180}
        >
          <span className="flex items-center gap-2 font-bold text-[#202124]">
            <Folder size={14} aria-hidden="true" className="text-[#0872b9]" />
            youtube
          </span>
          <FileTreeRow depth={1}>AI Notes</FileTreeRow>
          <FileTreeRow depth={2} file active>
            Reliable AI Agents.md
          </FileTreeRow>
          <FileTreeRow depth={2} file>
            Context Engineering.md
          </FileTreeRow>
          <FileTreeRow depth={1}>Research Talks</FileTreeRow>
        </MotionReveal>
      </div>

      <MotionReveal className="flex min-w-0 flex-col" delay={320}>
        <div className="flex items-center border-b border-[#e2e8f0] bg-[#f7f4ec] px-4 py-2.5 font-mono text-xs">
          <span className="inline-flex items-center gap-2 font-medium text-[#202124]">
            <span className="text-[#f5c451]" aria-hidden="true">
              ●
            </span>
            Reliable AI Agents.md
          </span>
        </div>
        <pre className="m-0 flex-1 overflow-auto p-5 font-mono text-xs leading-[1.8] text-[#3c4043]">
          <span className="text-[#94a3b8]">---</span>
          {"\n"}
          <span className="text-[#94a3b8]">title:</span>{" "}
          <span className="text-[#202124]">"Reliable AI Agents"</span>
          {"\n"}
          <span className="text-[#94a3b8]">channelName:</span>{" "}
          <span className="text-[#202124]">"AI Notes"</span>
          {"\n"}
          <span className="text-[#94a3b8]">videoId:</span>{" "}
          <span className="text-[#202124]">"aBcDeFg1234"</span>
          {"\n"}
          <span className="text-[#94a3b8]">durationSeconds:</span>{" "}
          <span className="text-[#202124]">1122</span>
          {"\n"}
          <span className="text-[#94a3b8]">capturedAt:</span>{" "}
          <span className="text-[#202124]">"2026-08-26T14:32:00Z"</span>
          {"\n"}
          <span className="text-[#94a3b8]">---</span>
          {"\n\n"}
          <span className="font-bold text-[#f5c451]"># Reliable AI Agents</span>
          {"\n\n"}
          <span className="font-bold text-[#202124]">## Transcript</span>
          {"\n\n"}
          {[
            ["[00:00]", "Before you add tools, define the outcome you want…"],
            [
              "[01:04]",
              "A reliable agent makes progress visible at every step…",
            ],
            [
              "[02:18]",
              "Start with observable behavior, not hidden reasoning…",
            ],
            [
              "[03:47]",
              "Small, deterministic workflows beat large clever ones…",
            ],
            ["[05:02]", "Add retries at the edges, idempotency at the core…"],
            [
              "[06:29]",
              "Log the inputs, and the failure becomes reproducible…",
            ],
            ["[07:55]", "Treat evals as code: versioned, reviewed, runnable…"],
            ["[09:12]", "Ship the smallest loop, then widen it with data…"],
          ].map(([timestamp, text]) => (
            <span key={timestamp}>
              <span className="text-[#0872b9]">{timestamp}</span>{" "}
              <span>{text}</span>
              {"\n"}
            </span>
          ))}
          <span className="text-[#94a3b8]">… 182 more segments</span>
        </pre>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#e2e8f0] bg-[#f7f4ec] px-4 py-3 font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
          <span className="text-[#64748b]">Plain Markdown</span>
          <span className="text-[#0872b9]">Yours to keep</span>
        </div>
      </MotionReveal>
    </div>
  );
}
