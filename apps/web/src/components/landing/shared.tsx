import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo-mark";

export const GITHUB_URL = "https://github.com/liujiaqi222/transcriptly";
export const CHROME_INSTALL_URL = `${GITHUB_URL}#%E4%BA%BA%E5%B7%A5%E8%BF%90%E8%A1%8C%E4%B8%8E%E9%AA%8C%E8%AF%81`;

export const pageWidth =
  "mx-auto w-[min(1200px,calc(100%-48px))] max-sm:w-[calc(100%-32px)]";

export const focusRing =
  "focus-visible:outline-[3px] focus-visible:outline-offset-3 focus-visible:outline-[#1b90ed]/40";

/** Mono uppercase label used for kickers and technical annotations. */
export const monoLabel =
  "font-mono text-xs font-medium tracking-[0.16em] uppercase";

/**
 * Serif display headline shared by the hero and every section. Fraunces at
 * 600 reads with editorial presence without the slab weight of the old
 * Inter 800 headlines.
 */
export const displayFace =
  "font-serif font-semibold tracking-[-0.03em] text-balance";

export function SectionKicker({
  index,
  label,
}: {
  index: string;
  label: string;
}) {
  return (
    <p
      className={`mb-5 inline-flex items-center gap-3 ${monoLabel} text-[#0872b9]`}
    >
      <span className="grid h-6 min-w-6 place-items-center rounded-md bg-[#edf7ff] px-1.5 tabular-nums text-[#0872b9]">
        {index}
      </span>
      <span className="h-px w-8 bg-[#1b90ed]" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

export function Brand() {
  return (
    <Link
      className={`inline-flex items-center gap-2 text-lg font-bold tracking-[-0.02em] no-underline ${focusRing}`}
      href="/"
      aria-label="Transcriptly home"
    >
      <LogoMark size={28} />
      <span>Transcriptly</span>
    </Link>
  );
}

export function CtaPair({
  compact = false,
  mobile = false,
}: {
  compact?: boolean;
  mobile?: boolean;
}) {
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
        <span className={mobile ? "sm:hidden" : undefined}>
          {mobile ? "Install" : "Add to Chrome"}
        </span>
        {mobile ? (
          <span className="hidden sm:inline">Add to Chrome</span>
        ) : null}
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
  title: ReactNode;
  copy: ReactNode;
}) {
  return (
    <div className="mb-12 max-w-190">
      <SectionKicker index={index} label={label} />
      <h2
        className={`${displayFace} m-0 text-[clamp(34px,4.6vw,56px)] leading-[1.02]`}
        id={id}
      >
        {title}
      </h2>
      <p className="mt-5 mb-0 max-w-[56ch] text-lg leading-[1.65] text-[#64748b]">
        {copy}
      </p>
    </div>
  );
}
