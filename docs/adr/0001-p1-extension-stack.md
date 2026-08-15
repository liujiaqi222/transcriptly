# P1 extension stack: WXT + pnpm workspaces + React + File System Access API

The P1 extension is built with WXT (Vite-based, MV3-first) rather than webpack (obsidian-clipper's route) or Vite+CRXJS: WXT gives first-class MV3 manifest generation, content-script HMR, and auto-zip with the least manual config. The monorepo uses pnpm workspaces with three packages (`packages/schema`, `packages/capture`, `apps/extension`) so the normalized capture contract and the environment-neutral capture core stay separable from the extension shell. Local Markdown saving uses the File System Access API (a directory handle chosen once via `showDirectoryPicker`, persisted in IndexedDB, non-destructive auto-suffix naming) rather than `chrome.downloads`, so saves land in a user-chosen folder (e.g. an Obsidian vault) as a one-action workflow — the reason Chrome/Chromium ships first.

## Considered options

- **webpack** (obsidian-clipper's route): proven, but more manual config — three manifest sources + CopyPlugin.
- **Vite + CRXJS**: Vite-native, but weaker MV3/content-script HMR maturity than WXT.
- **`chrome.downloads`**: simpler and Firefox-compatible, but no folder choice; deferred as a fallback.

## Consequences

- The content script runs in the ISOLATED world (DOM-only capture; the InnerTube/ytInitialData path is disabled per the obsidian-clipper research).
- P1 needs only popup + content script; the background service worker and options page are deferred to P2 (cloud upload/auth).
- The File System Access API popup focus-loss caveat is resolved in the capture UX prototype ticket (#12).
