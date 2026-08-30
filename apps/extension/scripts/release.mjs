#!/usr/bin/env node
/**
 * Release build + store-submission checks for the Chrome Web Store ZIP.
 *
 * `pnpm release` (from the repo root or apps/extension) runs a clean
 * production build and produces two ZIPs from the same checked bundle:
 *
 * - `*-chrome-sideload.zip` keeps the manifest `key` so an unpacked load
 *   derives the stable extension ID: GitHub Release downloads and local
 *   production testing get full functionality (reads and writes)
 * - `*-chrome-store.zip` drops the `key` because Chrome Web Store rejects
 *   uploaded manifests containing it; this is the Dashboard upload artifact
 *
 * Both are refused unless the build is store-ready:
 *
 * - manifest version is the package version (never 0.0.0)
 * - permissions and host_permissions are the reviewed production set
 * - only the expected entrypoints ship (popup, manager, background,
 *   content script) - no unused pages such as the removed playground
 * - no test files, no source maps, no dev addresses (localhost, ports)
 * - the configured development `key` still derives to the extension ID
 *   the server allowlists (EXTENSION_ORIGINS in deploy.yml / .env.example)
 * - the store ZIP does not contain `manifest.key`; the sideload ZIP does
 *
 * Exit code 1 with a report of every violation; success prints the ZIP
 * paths and sizes.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(scriptDir, "..");
const repoRoot = join(extensionRoot, "../..");
const outDir = join(extensionRoot, ".output");
const chromeDir = join(outDir, "chrome-mv3");

const packageJson = require(join(extensionRoot, "package.json"));

/** Files/entries that must never ship. */
const FORBIDDEN_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\.map$/,
  /^playground/i,
  /^test\//,
  /^e2e\//,
];

/** Dev addresses that must never appear in shipped text assets. */
const FORBIDDEN_CONTENT_PATTERNS = [
  /localhost/,
  /127\.0\.0\.1/,
  /:3000\b/,
  /:3001\b/,
];

/** Text-ish shipped assets scanned for dev addresses. */
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".html", ".css", ".json"]);

/** The reviewed production permission set (manifest v3). */
const EXPECTED_PERMISSIONS = ["alarms", "storage", "tabs"];
const EXPECTED_HOST_PERMISSIONS = ["https://transcript.libmap.cn/*"];

/** HTML pages that ship; anything else is an unused page. */
const EXPECTED_HTML_PAGES = ["manager.html", "popup.html"];

/**
 * The extension ID the web server allowlists (EXTENSION_ORIGINS). It is
 * SHA256(manifest key DER) first 16 bytes mapped 0-f -> a-p. Must match
 * the `key` in wxt.config.ts and every EXTENSION_ORIGINS value in the
 * repo; see docs/agents/chrome-web-store-release.md for the store-side
 * verification (dashboard Item ID) that can only happen after the first
 * upload.
 */
const EXPECTED_EXTENSION_ID = "jkopejjjgdkkacabdhgdlploehikphai";

/** Files (repo-root-relative) that must allowlist the extension origin. */
const ORIGIN_ALLOWLIST_FILES = [".env.example", ".github/workflows/deploy.yml"];

const violations = [];
const check = (ok, message) => {
  if (!ok) violations.push(message);
};

function run(command, args, env = {}) {
  execFileSync(command, args, {
    cwd: extensionRoot,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

console.log("> cleaning previous production output");
rmSync(chromeDir, { recursive: true, force: true });

console.log("> building production bundle (wxt zip)");
// NODE_ENV=production pins the web origin to the deployed site in
// wxt.config.ts; WXT's zip command builds first, then packs.
run("npx", ["wxt", "zip"], { NODE_ENV: "production" });

console.log("> checking bundle contents");
const files = listFiles(chromeDir).map((f) => relative(chromeDir, f));

// 1. No test files, source maps, or unused pages in the directory.
for (const file of files) {
  for (const pattern of FORBIDDEN_FILE_PATTERNS) {
    if (pattern.test(file)) {
      violations.push(`forbidden file in bundle: ${file}`);
    }
  }
}

// 2. Only the expected HTML pages ship.
const htmlPages = files.filter((f) => f.endsWith(".html")).sort();
check(
  JSON.stringify(htmlPages) === JSON.stringify([...EXPECTED_HTML_PAGES].sort()),
  `unexpected HTML pages: expected [${EXPECTED_HTML_PAGES}], got [${htmlPages}]`,
);

// 3. Manifest sanity: version, permissions, web origin.
const manifestPath = join(chromeDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath));
check(
  manifest.version === packageJson.version,
  `manifest version ${manifest.version} != package version ${packageJson.version}`,
);
check(
  manifest.version !== "0.0.0",
  `manifest version is the placeholder 0.0.0`,
);
check(
  JSON.stringify(manifest.permissions?.sort()) ===
    JSON.stringify([...EXPECTED_PERMISSIONS].sort()),
  `unexpected permissions: ${JSON.stringify(manifest.permissions)}`,
);
check(
  JSON.stringify(manifest.host_permissions ?? []) ===
    JSON.stringify(EXPECTED_HOST_PERMISSIONS),
  `unexpected host_permissions: ${JSON.stringify(manifest.host_permissions)}`,
);

// 4. Extension identity: the configured key must derive to the ID the
// server allowlists, and every repo allowlist entry must carry that ID.
//
// This key remains useful for unpacked development builds, but Chrome Web
// Store rejects uploaded manifests that contain it. The store package is
// rewritten without the field below, after this identity check.
let derivedId = "unavailable";
check(
  typeof manifest.key === "string" && manifest.key.length > 0,
  "built manifest is missing the configured development key",
);
if (typeof manifest.key === "string" && manifest.key.length > 0) {
  derivedId = createHash("sha256")
    .update(Buffer.from(manifest.key, "base64"))
    .digest()
    .subarray(0, 16)
    .toString("hex")
    .split("")
    .map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
    .join("");
  check(
    derivedId === EXPECTED_EXTENSION_ID,
    `manifest key derives to extension ID ${derivedId}, but the server allowlists ${EXPECTED_EXTENSION_ID}`,
  );
}
const expectedOrigin = `chrome-extension://${EXPECTED_EXTENSION_ID}`;
for (const allowlistFile of ORIGIN_ALLOWLIST_FILES) {
  const contents = readFileSync(join(repoRoot, allowlistFile), "utf8");
  check(
    contents.includes(expectedOrigin),
    `${allowlistFile} does not allowlist ${expectedOrigin}`,
  );
}

// 5. Package two ZIP variants from the exact directory checked below:
// the sideload variant keeps the key (stable ID for unpacked loads),
// the store variant drops it (Chrome Web Store rejects the field).
const storeZipPath = join(
  outDir,
  `transcriptlyextension-${packageJson.version}-chrome-store.zip`,
);
const sideloadZipPath = join(
  outDir,
  `transcriptlyextension-${packageJson.version}-chrome-sideload.zip`,
);

// WXT's own ZIP output is replaced by the two verified variants.
for (const stale of readdirSync(outDir).filter((f) => f.endsWith(".zip"))) {
  rmSync(join(outDir, stale), { force: true });
}

function zipDir(target) {
  execFileSync("zip", ["-qr", target, "."], {
    cwd: chromeDir,
    stdio: "inherit",
  });
}

zipDir(sideloadZipPath);

const manifestWithKey = readFileSync(manifestPath, "utf8");
delete manifest.key;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
check(
  !Object.hasOwn(JSON.parse(readFileSync(manifestPath)), "key"),
  "Chrome Web Store manifest still contains forbidden key field",
);
zipDir(storeZipPath);

// Restore the key in the unpacked output so loading
// .output/chrome-mv3 directly (local production testing) keeps the
// stable extension ID.
writeFileSync(manifestPath, manifestWithKey);

// 6. No dev addresses baked into shipped text assets.
for (const file of files) {
  if (!TEXT_EXTENSIONS.has(file.slice(file.lastIndexOf(".")))) continue;
  const contents = readFileSync(join(chromeDir, file), "utf8");
  for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
    if (pattern.test(contents)) {
      violations.push(`dev address in ${file}: /${pattern.source}/`);
    }
  }
}

// 7. Verify both rebuilt ZIPs carry the same files as the checked bundle
// directory, and that exactly one of them still has the key. The store
// variant is the artifact uploaded to Chrome Web Store; the sideload
// variant is what GitHub Releases distribute.
function zipEntryList(zipPath) {
  return execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s !== "" && !s.endsWith("/"));
}

const dirEntries = files.map((f) => f.split("\\").join("/")).sort();
for (const [label, zipPath] of [
  ["store", storeZipPath],
  ["sideload", sideloadZipPath],
]) {
  const entries = zipEntryList(zipPath);
  check(
    JSON.stringify([...entries].sort()) === JSON.stringify(dirEntries),
    `${label} ZIP contents differ from checked bundle directory`,
  );
  const zippedManifest = JSON.parse(
    execFileSync("unzip", ["-p", zipPath, "manifest.json"], {
      encoding: "utf8",
    }),
  );
  check(
    label === "store"
      ? !Object.hasOwn(zippedManifest, "key")
      : typeof zippedManifest.key === "string" && zippedManifest.key.length > 0,
    label === "store"
      ? "Chrome Web Store ZIP manifest still contains forbidden key field"
      : "sideload ZIP manifest lost the key (extension ID would not be stable)",
  );
  if (label === "sideload" && typeof zippedManifest.key === "string") {
    const sideloadId = createHash("sha256")
      .update(Buffer.from(zippedManifest.key, "base64"))
      .digest()
      .subarray(0, 16)
      .toString("hex")
      .split("")
      .map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
      .join("");
    check(
      sideloadId === EXPECTED_EXTENSION_ID,
      `sideload ZIP key derives to extension ID ${sideloadId}, but the server allowlists ${EXPECTED_EXTENSION_ID}`,
    );
  }
}

if (violations.length > 0) {
  console.error("\nRelease checks FAILED:");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

const storeKb = Math.round(statSync(storeZipPath).size / 1024);
const sideloadKb = Math.round(statSync(sideloadZipPath).size / 1024);
console.log("\nRelease checks passed.");
console.log(`  version:   ${manifest.version}`);
console.log(`  pages:     ${htmlPages.join(", ")}`);
console.log(`  dev id:    ${derivedId}`);
console.log(
  `  store zip: ${storeZipPath} (${storeKb} KB, no key - Dashboard upload)`,
);
console.log(
  `  sideload:  ${sideloadZipPath} (${sideloadKb} KB, with key - GitHub Release / local test)`,
);
