/**
 * Regenerate the extension's PNG toolbar/store icons from the SVG
 * source (`assets/logo.svg`). WXT auto-discovers `public/icon-<size>.png`
 * and writes them into the manifest, so no manifest config is needed.
 *
 * Run via `pnpm icons` after changing the SVG. The 16px favicon
 * rasterizes strokes at ~1.25px, so small sizes use a thickened
 * stroke to keep the beam legible.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.resolve(here, "../assets/logo.svg");
const outDir = path.resolve(here, "../public");

const SIZES = [16, 32, 48, 96, 128];

/** Below this size the 2.5-unit strokes get optically thin. */
const THICKEN_BELOW = 32;
const THICK_STROKE = "3.5";

const source = await readFile(svgPath, "utf8");

await mkdir(outDir, { recursive: true });

for (const size of SIZES) {
  let svg = source;
  if (size < THICKEN_BELOW) {
    svg = svg.replaceAll(
      'stroke-width="2.5"',
      `stroke-width="${THICK_STROKE}"`,
    );
  }
  // Inject an explicit raster size so sharp renders the vector at the
  // target resolution instead of upscaling a 32px bitmap.
  svg = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const out = path.join(outDir, `icon-${size}.png`);
  await writeFile(out, png);
  console.log(`wrote ${path.relative(process.cwd(), out)} (${size}x${size})`);
}
