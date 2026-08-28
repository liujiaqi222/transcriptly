import { FileText, Folder } from "lucide-react";
import { MotionReveal } from "./motion-reveal";

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

function FileTreeRow({
  children,
  depth = 0,
  file = false,
}: {
  children: string;
  depth?: number;
  file?: boolean;
}) {
  const Icon = file ? FileText : Folder;
  return (
    <span
      className="flex min-w-0 items-center gap-2 whitespace-nowrap"
      style={{ paddingLeft: depth * 16 }}
      title={children}
    >
      <Icon className="shrink-0" size={14} aria-hidden="true" />
      <span className="overflow-hidden text-ellipsis">{children}</span>
    </span>
  );
}

export function LocalKnowledgeDemo() {
  return (
    <div
      className="grid min-w-0 select-none grid-cols-[260px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white max-sm:grid-cols-1"
      role="img"
      aria-label="A local youtube folder containing channel folders and Markdown transcript files, with Reliable AI Agents Markdown open beside it"
    >
      <MotionReveal
        className="flex min-w-0 flex-col gap-3 border-r border-[#e2e8f0] bg-slate-50 p-5 font-mono text-[11px] leading-relaxed text-[#64748b] max-sm:border-r-0 max-sm:border-b"
        delay={180}
      >
        <div className="mb-1 flex items-center justify-between border-b border-[#e2e8f0] pb-3 font-sans text-[10px] font-bold tracking-[0.12em] text-[#64748b] uppercase">
          <span>Local files</span>
          <span className="text-[#0872b9]">~/youtube</span>
        </div>
        <FileTreeRow>youtube</FileTreeRow>
        <FileTreeRow depth={1}>AI Notes</FileTreeRow>
        <FileTreeRow depth={2} file>
          Reliable AI Agents.md
        </FileTreeRow>
        <FileTreeRow depth={2} file>
          Context Engineering.md
        </FileTreeRow>
        <FileTreeRow depth={1}>Research Talks</FileTreeRow>
      </MotionReveal>
      <MotionReveal className="flex min-w-0 flex-col" delay={320}>
        <MarkdownDemo />
        <div className="flex items-center justify-between gap-3 border-t border-[#e2e8f0] bg-[#fffdf8] px-5 py-3 text-[10px] font-bold tracking-[0.08em] text-[#64748b] uppercase max-sm:px-4">
          <span>Plain Markdown</span>
          <span className="text-[#0872b9]">Yours to keep</span>
        </div>
      </MotionReveal>
    </div>
  );
}
