import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo-mark";

export const GITHUB_URL = "https://github.com/liujiaqi222/transcriptly";
export const CHROME_INSTALL_URL = `${GITHUB_URL}#%E4%BA%BA%E5%B7%A5%E8%BF%90%E8%A1%8C%E4%B8%8E%E9%AA%8C%E8%AF%81`;

export const pageWidth =
  "mx-auto w-[min(1200px,calc(100%_-_48px))] max-sm:w-[calc(100%_-_32px)]";
export const focusRing =
  "focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40";
export const eyebrow =
  "mb-4 inline-flex items-center gap-3 whitespace-nowrap text-[12px] font-bold tracking-[0.14em] text-[#0872b9] uppercase";

export function SectionKicker({
  index,
  label,
}: {
  index: string;
  label: string;
}) {
  return (
    <p className={eyebrow}>
      <span className="grid h-6 min-w-6 place-items-center rounded-md bg-[#edf7ff] px-1.5 text-[11px] tracking-[0.02em] text-[#0872b9] tabular-nums">
        {index}
      </span>
      <span className="h-px w-8 bg-[#1b90ed]" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

export function Brand() {
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

export function CtaPair({ compact = false }: { compact?: boolean }) {
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
          className={`${button} min-h-12 border-[#202124] bg-transparent text-[#202124] hover:border-[#1b90ed] hover:text-[#0872b9]`}
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

export function SectionHeading({
  id,
  index,
  label,
  title,
  copy,
}: {
  id: string;
  index: string;
  label: string;
  title: string;
  copy: ReactNode;
}) {
  return (
    <div className="mb-12 max-w-[760px]">
      <SectionKicker index={index} label={label} />
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
