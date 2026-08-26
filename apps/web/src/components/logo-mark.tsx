import { LOGO_ACCENT } from "@/lib/logo";

/**
 * The Transcriptly logo as a React component for web surfaces: an ink
 * play glyph shooting a CTA-yellow beam - the saved transcript. Ink
 * inherits `currentColor`. Single source of truth lives in
 * `lib/logo.ts`; the mark is brand artwork, so hand-drawn SVG paths
 * are allowed here.
 */
export function LogoMark({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 10 Q5 7 7.4 8.8 L14.6 14.2 Q17 16 14.6 17.8 L7.4 23.2 Q5 25 5 22 Z"
        fill="currentColor"
      />
      <g stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <line x1={20.5} y1={8} x2={26} y2={8} />
        <line x1={19} y1={16} x2={29} y2={16} stroke={LOGO_ACCENT} />
        <line x1={20.5} y1={24} x2={23} y2={24} />
      </g>
    </svg>
  );
}
