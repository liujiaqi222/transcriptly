# Transcriptly

[Transcriptly](https://transcriptly.libmap.cn) is a free, open-source YouTube
transcript downloader. A Chrome extension captures the transcript of any
YouTube video as timestamped Markdown — one video at a time, or a whole
playlist or channel in batch — and keeps everything as plain files on your own
computer. Optionally, you can publish a copy to the public transcript archive.

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Transcriptly-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/transcriptly/jkopejjjgdkkacabdhgdlploehikphai)
[![Site](https://img.shields.io/badge/Archive-transcriptly.libmap.cn-0872b9)](https://transcriptly.libmap.cn)

## Why Transcriptly

- **You own the files.** Captures land as ordinary `.md` files in a folder you
  choose — no account, no upload. Search them with `grep`, version them with
  `git`, read them in Obsidian or VS Code, or feed them to any tool that reads
  text.
- **Timestamps stay useful.** The Timeline format keeps a `[mm:ss]` anchor on
  every paragraph, so a line of text always points back to the moment in the
  video. The Article format reflows the same transcript into clean prose.
- **Batch by default.** On a playlist or channel page, tick the videos you
  want and let the batch manager work through them in the background — with
  pause, resume, and retry. Every video becomes its own Markdown file.
- **Publishing is a choice, not a side effect.** Contributing a capture to
  the public archive is a separate, explicit destination: sign in, confirm
  once, and manage or retract your contributions anytime. Reading the archive
  is free and needs no account.

## How it works

1. **Capture** — open a YouTube video with a transcript, click the
   Transcriptly icon, review the preview, and save.
2. **Store** — the transcript is written to local Markdown via the File
   System Access API, in the folder you picked.
3. **Find** — your library is plain text: search it with the tools you
   already use.
4. **Publish (optional)** — toggle *Public archive* before saving to share a
   copy at [transcriptly.libmap.cn](https://transcriptly.libmap.cn), where it
   becomes a searchable, attributed transcript page that links back to
   YouTube.

For playlists and channels, tick videos on the list page and the batch
manager handles the rest.

## Install

### Chrome extension

- From the [Chrome Web Store](https://chromewebstore.google.com/detail/transcriptly/jkopejjjgdkkacabdhgdlploehikphai)
  (recommended), or
- Download the `*-chrome-sideload.zip` from a
  [GitHub release](https://github.com/liujiaqi222/transcriptly/releases),
  unzip it, and load the folder via `chrome://extensions` → *Load unpacked*.

### Public archive

No install needed — browse and search at
[transcriptly.libmap.cn](https://transcriptly.libmap.cn). Sign in only if you
want to publish captures or manage your contributions.

## Running from source

Prerequisites: **Node.js ≥ 20** and **pnpm ≥ 11** (`corepack enable` works).

```sh
pnpm install
```

### Extension only (local capture)

The extension works without the website — local Markdown saving needs no
server.

```sh
pnpm dev:extension
```

WXT starts a dev server and prints a "Load unpacked" path; load it in Chrome
via `chrome://extensions`. The production build is `pnpm --filter
@transcriptly/extension build` (or `pnpm release` for the validated
store/sideload ZIPs).

### Full stack (extension + website)

The website is a Next.js app with PostgreSQL (auth, private library, public
archive).

```sh
cp .env.example .env            # fill in the values below
pnpm cloud:up                   # postgres + migrations + app on :3000
pnpm dev:web                    # hot-reload dev server on :3000
```

`.env` needs:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (the compose default works as-is) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` for local dev |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth callback: `http://localhost:3000/api/auth/callback/google` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth callback: `http://localhost:3000/api/auth/callback/github` |
| `EXTENSION_ORIGINS` | Comma-separated `chrome-extension://` origins allowed to call auth endpoints; the pinned dev ID default works with the in-repo extension key |

Sign in at `localhost:3000`, then use *Sign in* inside the extension to share
the website session — after that, *Public archive* becomes available as a
save destination.

### Useful commands

| Command | What it does |
| --- | --- |
| `pnpm dev:extension` | Extension dev build with HMR |
| `pnpm dev:web` | Website dev server |
| `pnpm cloud:up` / `cloud:down` | Postgres + migrations + app via Docker Compose |
| `pnpm test` | Unit tests (all packages) |
| `pnpm e2e` | Extension end-to-end tests (Playwright) |
| `pnpm lint` / `pnpm typecheck` | Biome lint / TypeScript |
| `pnpm release` | Build + validate the store/sideload ZIPs |
| `pnpm db:generate` / `db:migrate` | Drizzle schema migrations |

## Repository layout

```
packages/schema    capture type contract (single source of truth)
packages/capture   environment-neutral capture core + Markdown serializer
apps/extension     WXT extension: popup, content script, batch manager,
                   cloud queue, store listing assets (store-assets/)
apps/web           Next.js site: auth, private library, public archive
docs/adr           architecture decision records
```

## Privacy

Local captures never leave your machine. Public publication happens only
after an explicit, confirmed opt-in, and contributions can be retracted from
My Contributions. See the
[privacy policy](https://transcriptly.libmap.cn/privacy).

## License

No license yet — all rights reserved until one is added.
