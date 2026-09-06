# Chrome Web Store listing — Transcriptly

Paste-ready copy for the Developer Dashboard "Store listing" and "Privacy"
tabs. Assets live in this folder; screenshots are composed from real UI
captures in `src/` via `scripts/compose-store-screenshots.mjs`.

## 1. Item basics

| Field | Value |
| --- | --- |
| Name (≤45 chars) | `Transcriptly – YouTube Transcript Downloader` |
| Short description (≤132 chars) | `Free batch YouTube transcript downloader. Save videos, playlists & channels as timestamped Markdown or publish them publicly.` |
| Category | Productivity |
| Language | English |
| Pricing | Free |
| Regions | All regions |
| Website | https://transcriptly.libmap.cn |
| Privacy policy | https://transcriptly.libmap.cn/privacy |
| Support email | z473487465@gmail.com |
| Open source | https://github.com/liujiaqi222/transcriptly |

The manifest description in `wxt.config.ts` (shown on chrome://extensions and
as the package description) is:

```text
Free YouTube transcript downloader. Capture a video or batch-capture playlists & channels as timestamped Markdown files.
```

## 2. Detailed description (paste into "Description")

```text
Transcriptly is a free YouTube transcript downloader. Capture the
transcript of any video as timestamped Markdown — one video, or a whole
playlist or channel in batch — and keep everything as plain files on
your own computer. Optionally publish a copy to the public transcript
archive.

⬇️ CAPTURE
• Open any YouTube video, review the transcript preview, and save it as
  Markdown
• Timeline format keeps every timestamp; Article format reflows into
  clean prose
• One click, no account, no upload — the file lands in the folder you
  choose

⚡ BATCH DOWNLOAD
• On any playlist or channel Videos page, tick the videos you want
• The batch manager downloads transcripts in the background: pause,
  resume, retry
• Progress and per-video status for every item (saved / running /
  queued)
• Each video becomes its own .md file, organized in your folder
• Built for large playlists — no hard cap on batch size

📁 LOCAL-FIRST MARKDOWN
• Plain Markdown files: search with grep, version with git, read in
  Obsidian or VS Code
• Your library works offline; nothing leaves your machine unless you
  say so

🌍 PUBLIC ARCHIVE (OPTIONAL)
• Sign in to publish a copy of any capture to transcriptly.libmap.cn
• Public pages are searchable and readable by everyone, attributed to
  you
• Publishing is explicit: confirm once before your first contribution,
  retract anytime from My Contributions
• Reading the archive is free and needs no account

HOW TO USE
1. Open any YouTube video that has a transcript
2. Click the Transcriptly icon, preview, then Save
3. For playlists or channels: open the list page, tick videos, and
   start the batch

PERMISSIONS
• tabs — detect the video, playlist, or channel page you're on and
  coordinate batch capture
• storage — remember your preferences and the batch queue while it
  runs
• alarms — retry failed downloads automatically
• transcriptly.libmap.cn — used only when you choose to publish to the
  public archive
• Content script on youtube.com — reads the transcript text already
  rendered on the page

Transcriptly is open source: https://github.com/liujiaqi222/transcriptly
Privacy policy: https://transcriptly.libmap.cn/privacy
```

## 3. Privacy tab

### Single purpose

```text
Download YouTube transcripts as timestamped Markdown files — one video or a whole playlist/channel in batch — with optional publication to the public transcript archive.
```

### Permission justifications

Paste each text into the matching Dashboard field (the host-permission
field covers both the `content_scripts` match and `host_permissions`):

**需请求 alarms 的理由 / alarms justification**

```text
Schedules automatic retries for failed downloads and uploads.
```

**需请求 storage 的理由 / storage justification**

```text
Stores user preferences (save folder, Markdown format) and the persistent batch queue.
```

**需请求 tabs 的理由 / tabs justification**

```text
Batch capture opens and coordinates YouTube tabs to download each video's transcript; tabs is also needed to detect the current page (video, playlist, or channel).
```

**需请求主机权限的理由 / host permission justification**
(covers `content_scripts: youtube.com` and
`host_permissions: https://transcriptly.libmap.cn/*`)

```text
Content script on youtube.com: reads the transcript text already rendered on YouTube watch pages to build the Markdown capture. Host permission for transcriptly.libmap.cn: used only when the user explicitly chooses to publish a capture to the public archive, and to sync the signed-in website session.
```

### Data usage disclosures

- **Website content (transcripts):** processed locally in the browser; it
  only leaves the device when the user explicitly publishes a capture.
- **Personal info (display name, avatar, email):** collected only for the
  optional sign-in and public attribution; email is never shown publicly.
- **Compliance:** no data sale, no ads or ad networks, no remote code — all
  code is bundled in the package.

## 4. Store images (this folder)

| File | Size | Used as |
| --- | --- | --- |
| `screenshot-1-capture.png` | 1280×800 | Screenshot 1 — popup, saved + contributed state |
| `screenshot-2-batch.png` | 1280×800 | Screenshot 2 — batch manager, local + public badges |
| `screenshot-3-archive.png` | 1280×800 | Screenshot 3 — public archive reading page |
| `tile-440x280.png` | 440×280 | Small promo tile (optional) |
| `marquee-1400x560.png` | 1400×560 | Marquee promo (24-bit PNG, no alpha) |
| `icon-128-store.png` | 128×128 | Store icon |

Regenerate everything with:

```sh
node scripts/compose-store-screenshots.mjs   # screenshots + tile + marquee (needs store-assets/src/*.png)
node scripts/generate-store-assets.mjs       # store icon from assets/logo.svg
```

## 5. Upload checklist

1. `pnpm release` — builds and validates; produces `*-chrome-store.zip`
   (keyless, for the Dashboard) and `*-chrome-sideload.zip`.
2. Upload `*-chrome-store.zip` under Package.
3. Fill in the listing from sections 1–3 above and upload the images from
   section 4.
4. First upload only: reconcile the item ID across
   - Dashboard → Package → Item ID,
   - the `key` in `apps/extension/wxt.config.ts` (unpacked build must show
     the same ID on chrome://extensions),
   - `EXTENSION_ORIGINS` in `.github/workflows/deploy.yml` (and local env
     files). See `docs/agents/chrome-web-store-release.md`.
5. Submit for review.
