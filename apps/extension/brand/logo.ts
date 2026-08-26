/**
 * The Transcriptly logo, "play to text" mark: an ink play glyph shoots
 * a CTA-yellow beam - the saved transcript - flanked by two ink text
 * lines. Ink renders via `currentColor`; the beam is fixed to the
 * brand CTA yellow. Single source of truth for every extension
 * surface (React components and imperative DOM). The logo is brand
 * artwork, not a UI icon, so hand-drawn SVG paths are allowed here.
 */
export const LOGO_ACCENT = "#f5c451";

/** Inner artwork on the shared 32x32 grid; stroke matches Lucide's 2/24. */
export const LOGO_ART = `
  <path
    d="M5 10 Q5 7 7.4 8.8 L14.6 14.2 Q17 16 14.6 17.8 L7.4 23.2 Q5 25 5 22 Z"
    fill="currentColor"
  />
  <g stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <line x1="20.5" y1="8" x2="26" y2="8" />
    <line x1="19" y1="16" x2="29" y2="16" stroke="${LOGO_ACCENT}" />
    <line x1="20.5" y1="24" x2="23" y2="24" />
  </g>
`;

/** Full inline `<svg>` markup for imperative DOM surfaces. */
export function logoSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" fill="none" aria-hidden="true" focusable="false">${LOGO_ART}</svg>`;
}
