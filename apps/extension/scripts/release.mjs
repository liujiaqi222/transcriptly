#!/usr/bin/env node
/**
 * Release build + store-submission checks for the Chrome Web Store ZIP.
 *
 * `pnpm release` (from the repo root or apps/extension) runs a clean
 * production build, zips it, and refuses to hand over the ZIP unless the
 * build is store-ready:
 *
 * - manifest version is the package version (never 0.0.0)
 * - permissions and host_permissions are the reviewed production set
 * - only the expected entrypoints ship (popup, manager, background,
 *   content script) - no unused pages such as the removed playground
 * - no test files, no source maps, no dev addresses (localhost, ports)
 *
 * Exit code 1 with a report of every violation; success prints the ZIP
 * path and size.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const extensionRoot = join(scriptDir, "..");
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
const manifest = JSON.parse(readFileSync(join(chromeDir, "manifest.json")));
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

// 4. No dev addresses baked into shipped text assets.
for (const file of files) {
  if (!TEXT_EXTENSIONS.has(file.slice(file.lastIndexOf(".")))) continue;
  const contents = readFileSync(join(chromeDir, file), "utf8");
  for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
    if (pattern.test(contents)) {
      violations.push(`dev address in ${file}: /${pattern.source}/`);
    }
  }
}

// 5. The ZIP itself: find the freshly written archive and verify its
// entry list matches the checked directory (no extras, no misses).
const zipCandidates = readdirSync(outDir)
  .filter((f) => f.endsWith(".zip"))
  .map((f) => ({ f, mtime: statSync(join(outDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
const zipPath = zipCandidates[0] ? join(outDir, zipCandidates[0].f) : undefined;
check(zipPath !== undefined, "no ZIP produced by wxt zip");

let zipEntries = [];
if (zipPath) {
  zipEntries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s !== "" && !s.endsWith("/"));
  const dirEntries = files.map((f) => f.split("\\").join("/")).sort();
  const zipSorted = [...zipEntries].sort();
  check(
    JSON.stringify(zipSorted) === JSON.stringify(dirEntries),
    `ZIP contents differ from checked bundle directory`,
  );
}

if (violations.length > 0) {
  console.error("\nRelease checks FAILED:");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

const zipKb = zipPath ? Math.round(statSync(zipPath).size / 1024) : 0;
console.log("\nRelease checks passed.");
console.log(`  version:   ${manifest.version}`);
console.log(`  pages:     ${htmlPages.join(", ")}`);
console.log(
  `  zip:       ${zipPath} (${zipKb} KB, ${zipEntries.length} files)`,
);
