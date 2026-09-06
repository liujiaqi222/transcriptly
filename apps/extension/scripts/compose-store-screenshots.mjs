/**
 * Compose the store's 1280x800 screenshots from real UI captures in
 * `store-assets/src/`, using the brand rules in `docs/agents/visual-design.md`:
 *   - screenshot-1-capture.png    popup preview (Timeline/Article, Save)
 *   - screenshot-2-batch.png      batch manager (progress, per-video states)
 *   - screenshot-3-archive.png    public archive reading page on the web
 *
 * The left copy column is rendered with satori using the project's own
 * fonts - Fraunces display + Inter text, the same faces as the web app,
 * vendored in `apps/web/src/app/fonts/` for the OG image. Card geometry is
 * derived from each source screenshot's aspect ratio, so the card hugs the
 * image with no letterboxing.
 *
 * Run via `node scripts/compose-store-screenshots.mjs` from apps/extension.
 * Requires `satori` (resolved from the extension, the workspace, or a local
 * scratch install; sharp ships with the extension's devDependencies).
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);

/** satori is a transitive dep of next; resolve it from wherever it exists. */
function loadSatori() {
  const candidates = [
    () => require("satori"),
    () => require(path.resolve(here, "../../web/node_modules/satori")),
    () => require("/tmp/woffid/node_modules/satori"),
  ];
  for (const load of candidates) {
    try {
      const mod = load();
      const fn = mod.default ?? mod;
      if (typeof fn === "function") return fn;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "satori not found - run `pnpm add -D satori` in apps/extension",
  );
}

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "../store-assets/src");
const outDir = path.resolve(here, "../store-assets");
const fontsDir = path.resolve(here, "../../web/src/app/fonts");

/** Extract the vendored base64 WOFF string from a font module. */
async function importFontModule(file) {
  const code = await readFile(path.join(fontsDir, file), "utf8");
  const match = code.match(/BASE64 =\s*"([A-Za-z0-9+/=]+)"/);
  if (!match) throw new Error(`no base64 font found in ${file}`);
  return Buffer.from(match[1], "base64");
}

const [fraunces600, inter400, inter700] = await Promise.all([
  importFontModule("fraunces-latin-600.ts"),
  importFontModule("inter-latin-400.ts"),
  importFontModule("inter-latin-700.ts"),
]);

const satori = loadSatori();

const INK = "#202124";
const BLUE_TEXT = "#0872b9";
const YELLOW = "#f5c451";
const SLATE = "#64748b";
const BORDER = "#e2e8f0";
const SOFT_BLUE = "#edf7ff";

const CANVAS = { width: 1280, height: 800 };
/** Copy column horizontal span; cards start after it. */
const COLUMN = { left: 84 };
/** Card right edge aligns here on every screenshot. */
const CARD_RIGHT = 1200;
/** Vertical band the card floats in. */
const CARD_BAND = { top: 44, bottom: 756 };
const CARD_PAD = 18;

const logoSvg = await readFile(
  path.resolve(here, "../assets/logo.svg"),
  "utf8",
);
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

/* ------------------------------------------------ satori copy components */

const col = (children) => ({
  type: "div",
  props: {
    style: {
      width: `${CANVAS.width}px`,
      height: `${CANVAS.height}px`,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      paddingLeft: `${COLUMN.left}px`,
      paddingTop: "64px",
    },
    children,
  },
});

const logoRow = () => ({
  type: "img",
  props: { src: logoDataUri, width: 56, height: 56 },
});

const heading = (lines) => ({
  type: "div",
  props: {
    style: {
      marginTop: "56px",
      display: "flex",
      flexDirection: "column",
      fontFamily: "Fraunces",
      fontWeight: 600,
      fontSize: "54px",
      lineHeight: "1.15",
      color: INK,
    },
    children: lines.map((line) => ({ type: "div", props: { children: line } })),
  },
});

const sub = (lines) => ({
  type: "div",
  props: {
    style: {
      marginTop: "24px",
      display: "flex",
      flexDirection: "column",
      fontFamily: "Inter",
      fontSize: "23px",
      lineHeight: "1.55",
      color: SLATE,
    },
    children: lines.map((line) => ({ type: "div", props: { children: line } })),
  },
});

const eyebrow = (text) => ({
  type: "div",
  props: {
    style: {
      marginTop: "40px",
      fontFamily: "InterBold",
      fontSize: "14px",
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: SLATE,
    },
    children: text,
  },
});

const boldLines = (lines) => ({
  type: "div",
  props: {
    style: {
      marginTop: "10px",
      display: "flex",
      flexDirection: "column",
      fontFamily: "InterBold",
      fontSize: "22px",
      lineHeight: "1.45",
      color: INK,
    },
    children: lines.map((line) => ({ type: "div", props: { children: line } })),
  },
});

const chipRow = (chips) => ({
  type: "div",
  props: {
    style: { marginTop: "36px", display: "flex", gap: "16px" },
    children: chips.map((chip) => ({
      type: "div",
      props: {
        style: {
          display: "flex",
          padding: "12px 24px",
          borderRadius: "999px",
          background: chip.soft ? SOFT_BLUE : "#ffffff",
          border: chip.soft ? "1px solid #d6ebfc" : `1px solid ${BORDER}`,
          color: chip.soft ? BLUE_TEXT : INK,
          fontFamily: "InterBold",
          fontSize: "18px",
        },
        children: chip.label,
      },
    })),
  },
});

const footnote = (lines) => ({
  type: "div",
  props: {
    style: {
      marginTop: "44px",
      display: "flex",
      flexDirection: "column",
      fontFamily: "Inter",
      fontSize: "17px",
      lineHeight: "1.5",
      color: SLATE,
    },
    children: lines.map((line) => ({ type: "div", props: { children: line } })),
  },
});

const spacer = (h) => ({
  type: "div",
  props: { style: { height: `${h}px`, display: "flex" } },
});

/* ------------------------------------------------------------- rendering */

/** Rasterize a vector SVG layer at 2x then downscale for crisp output. */
async function rasterizeLayer(svg) {
  return sharp(Buffer.from(svg), { density: 144, limitInputPixels: false })
    .resize(CANVAS.width, CANVAS.height)
    .png()
    .toBuffer();
}

/**
 * Card geometry shrink-wrapped around the source image: fit the image in
 * the band (and under `maxInnerW`), then size the card to image + padding
 * and right-align it.
 */
function cardGeom(srcW, srcH, maxInnerW) {
  const bandH = CARD_BAND.bottom - CARD_BAND.top;
  const ihMax = bandH - 2 * CARD_PAD;
  const scale = Math.min(ihMax / srcH, maxInnerW / srcW);
  const iw = srcW * scale;
  const ih = srcH * scale;
  const w = Math.round(iw + 2 * CARD_PAD);
  const h = Math.round(ih + 2 * CARD_PAD);
  return {
    w,
    h,
    x: CARD_RIGHT - w,
    y: Math.round(CARD_BAND.top + (bandH - h) / 2),
    iw: Math.round(iw),
    ih: Math.round(ih),
    ix: Math.round(CARD_RIGHT - w + CARD_PAD),
    iy: Math.round(CARD_BAND.top + (bandH - h) / 2 + CARD_PAD),
  };
}

async function composeShot({ copyChildren, srcFile, outFile, maxInnerW }) {
  const copySvg = await satori(col(copyChildren), {
    width: CANVAS.width,
    height: CANVAS.height,
    fonts: [
      { name: "Fraunces", data: fraunces600, weight: 600, style: "normal" },
      { name: "Inter", data: inter400, weight: 400, style: "normal" },
      { name: "InterBold", data: inter700, weight: 700, style: "normal" },
    ],
  });

  const meta = await sharp(path.join(srcDir, srcFile)).metadata();
  const card = cardGeom(meta.width, meta.height, maxInnerW);

  const frameSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}">
    <rect width="${CANVAS.width}" height="${CANVAS.height}" fill="#ffffff"/>
    <rect x="${card.x}" y="${card.y}" width="${card.w}" height="${card.h}" rx="12" fill="#ffffff" stroke="${BORDER}" stroke-width="2"/>
  </svg>`;

  const img = await sharp(path.join(srcDir, srcFile))
    .resize(card.iw, card.ih)
    .png()
    .toBuffer();

  await writeFile(
    path.join(outDir, outFile),
    await sharp({
      create: {
        width: CANVAS.width,
        height: CANVAS.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        { input: await rasterizeLayer(frameSvg), left: 0, top: 0 },
        { input: await rasterizeLayer(copySvg), left: 0, top: 0 },
        { input: img, left: card.ix, top: card.iy },
      ])
      .png()
      .toBuffer(),
  );
  console.log(`wrote store-assets/${outFile}`);
}

/* --------------------------------------------------------------- outputs */

await composeShot({
  srcFile: "popup-capture.png",
  outFile: "screenshot-1-capture.png",
  maxInnerW: 460, // portrait source: height-limited anyway
  copyChildren: [
    logoRow(),
    heading(["Capture YouTube", "as Markdown"]),
    sub([
      "A video's transcript becomes a timestamped file",
      "— keep it locally, or publish a copy publicly.",
    ]),
    eyebrow("YouTube video"),
    boldLines(["How to think clearly in the era of noise"]),
    chipRow([
      { label: "Local Markdown" },
      { label: "+ Public archive", soft: true },
    ]),
    spacer(52),
    footnote([
      "transcript.md — ready for Obsidian, VS Code, grep, or an agent.",
    ]),
  ],
});

await composeShot({
  srcFile: "batch-manager.png",
  outFile: "screenshot-2-batch.png",
  maxInnerW: 560,
  copyChildren: [
    logoRow(),
    heading(["Capture a whole", "playlist at once"]),
    sub([
      "Tick videos on any playlist or",
      "channel page — the batch manager",
      "runs in the background, with",
      "pause, resume, and retry.",
    ]),
    chipRow([{ label: "Local + public archive", soft: true }]),
    spacer(56),
    footnote([
      "Every video becomes its own Markdown file,",
      "organized in the folder you choose.",
    ]),
  ],
});

await composeShot({
  srcFile: "public-archive.png",
  outFile: "screenshot-3-archive.png",
  maxInnerW: 560,
  copyChildren: [
    logoRow(),
    heading(["Read captures on", "the public archive"]),
    sub([
      "Contributed captures become public",
      "transcript pages — searchable,",
      "readable by everyone, attributed to you.",
    ]),
    eyebrow("Publishing is always explicit"),
    boldLines([
      "Sign in, confirm once, and manage",
      "or retract contributions anytime.",
    ]),
    chipRow([{ label: "Free · no account needed to read", soft: true }]),
    spacer(48),
    footnote(["transcriptly.libmap.cn — every page links back to YouTube."]),
  ],
});

/* ----------------------------------------------------------------- tile */

/** Small promo tile (440x280), same project fonts as the screenshots. */
const tileSvg = await satori(
  {
    type: "div",
    props: {
      style: {
        width: "440px",
        height: "280px",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
      },
      children: [
        {
          type: "div",
          props: {
            style: { height: "6px", background: YELLOW, display: "flex" },
          },
        },
        {
          type: "div",
          props: {
            style: {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            },
            children: [
              {
                type: "img",
                props: { src: logoDataUri, width: 84, height: 84 },
              },
              {
                type: "div",
                props: {
                  style: {
                    marginTop: "14px",
                    fontFamily: "InterBold",
                    fontSize: "38px",
                    color: INK,
                  },
                  children: "Transcriptly",
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    marginTop: "6px",
                    fontFamily: "Inter",
                    fontSize: "18px",
                    color: SLATE,
                  },
                  children: "Capture YouTube as Markdown",
                },
              },
            ],
          },
        },
      ],
    },
  },
  {
    width: 440,
    height: 280,
    fonts: [
      { name: "Fraunces", data: fraunces600, weight: 600, style: "normal" },
      { name: "Inter", data: inter400, weight: 400, style: "normal" },
      { name: "InterBold", data: inter700, weight: 700, style: "normal" },
    ],
  },
);

await writeFile(
  path.join(outDir, "tile-440x280.png"),
  await sharp(Buffer.from(tileSvg)).resize(440, 280).png().toBuffer(),
);
console.log("wrote store-assets/tile-440x280.png");

/* --------------------------------------------------------------- marquee */

/**
 * Large marquee promo (1400x560). Store requires JPEG or 24-bit PNG with
 * no alpha, so the output is flattened onto white. The brand wordmark is
 * Fraunces; the subline is Inter, matching the web app.
 */
const marqueeSvg = await satori(
  {
    type: "div",
    props: {
      style: {
        width: "1400px",
        height: "560px",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
      },
      children: [
        {
          type: "div",
          props: {
            style: { height: "8px", background: YELLOW, display: "flex" },
          },
        },
        {
          type: "div",
          props: {
            style: {
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "64px",
              paddingLeft: "40px",
            },
            children: [
              {
                type: "img",
                props: { src: logoDataUri, width: 190, height: 190 },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontFamily: "Fraunces",
                          fontWeight: 600,
                          fontSize: "72px",
                          color: INK,
                        },
                        children: "Transcriptly",
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          marginTop: "12px",
                          display: "flex",
                          flexDirection: "column",
                          fontFamily: "Inter",
                          fontSize: "27px",
                          lineHeight: 1.5,
                          color: SLATE,
                        },
                        children: [
                          {
                            type: "div",
                            props: {
                              children:
                                "Free batch YouTube transcript downloader.",
                            },
                          },
                          {
                            type: "div",
                            props: {
                              children:
                                "Timestamped Markdown — locally or in the public archive.",
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  },
  {
    width: 1400,
    height: 560,
    fonts: [
      { name: "Fraunces", data: fraunces600, weight: 600, style: "normal" },
      { name: "Inter", data: inter400, weight: 400, style: "normal" },
      { name: "InterBold", data: inter700, weight: 700, style: "normal" },
    ],
  },
);

// Flatten onto opaque white: the store rejects PNGs with an alpha channel.
await writeFile(
  path.join(outDir, "marquee-1400x560.png"),
  await sharp(Buffer.from(marqueeSvg))
    .resize(1400, 560)
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer(),
);
console.log("wrote store-assets/marquee-1400x560.png");
