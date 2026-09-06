/**
 * Chrome Web Store icon: 128x128 rendered straight from the brand logo
 * source (`assets/logo.svg`). The promo tile moved to
 * `scripts/compose-store-screenshots.mjs`, which renders store text with
 * the project's fonts.
 *
 * Run via `node scripts/generate-store-assets.mjs` from apps/extension.
 * These are marketing assets, not shipped in the extension bundle.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.resolve(here, "../assets/logo.svg");
const outDir = path.resolve(here, "../store-assets");

const source = await readFile(svgPath, "utf8");

await mkdir(outDir, { recursive: true });

const iconSvg = source.replace("<svg ", '<svg width="128" height="128" ');
await writeFile(
  path.join(outDir, "icon-128-store.png"),
  await sharp(Buffer.from(iconSvg)).png().toBuffer(),
);
console.log("wrote store-assets/icon-128-store.png");
