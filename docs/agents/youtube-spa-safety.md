# YouTube SPA batch safety

YouTube reuses one document while navigating between channels, playlists, and watch pages. DOM lifetime is therefore wider than the currently visible batch source.

## Invariants

- **Source identity**: key batch discovery and selection state by the current channel or playlist. A channel root and its `/videos` tab share one identity; another channel or playlist does not.
- **Source switch**: when SPA navigation changes that identity, clear discovered videos, selections, saved-status lookups, badges, and card markers before reading the new page.
- **Watch round trip**: a visit from a batch source to one of its watch pages and back may preserve selection because the batch source identity has not changed.
- **Target identity**: before either destination writes a Capture, require `capture.source.videoId` to equal the BatchVideo requested by the task. Treat a mismatch as a permanent failure.
- **Single-save identity gate**: the address bar URL changes the moment SPA navigation starts, but the re-rendered body, the head, and the `ytInitialData` script tag lag behind — the script tag and head stay frozen at the previously-opened video indefinitely (#127). Before reading source metadata or transcript segments, wait until the live DOM identifies itself as the requested video (`ytd-watch-flexy[video-id]`); fail with `mismatched-page` if it names another video. While capturing, treat `ytInitialData` and every head fallback as usable only when they provably describe the requested video (their own `currentVideoEndpoint` / canonical videoId matches); otherwise read identity from the live DOM.

## Regression contract

Every change in this area must keep these cases covered:

1. Select on channel A, navigate through YouTube's SPA to channel B, then Select all: the start request contains only channel B videos.
2. Select on a channel Videos tab, visit a watch page, then return to the same channel: the selection is restored.
3. Request video A and receive a Capture for video B: no local or cloud write runs, and the item reports a mismatch failure.
4. Open video A, SPA-navigate to video B, save B: the Capture carries B's channel name/url/avatar and transcript — never A's — and a capture requested while the page still renders A fails with `mismatched-page` instead of writing.

Run the focused batch page and tab-capture tests first, then the full extension tests, typecheck, production build, and `git diff --check`.

## Incident signature

- **Symptom**: Select all on one creator's channel saves videos from another creator.
- **Root cause**: source-scoped collections survived cross-channel SPA navigation, and the capture boundary did not independently enforce target video identity.
- **Defense**: reset on source-identity change and validate target identity at the final capture boundary. Either guard may catch a defect; both are required.

## Incident 2026-09-23 (#127): single save kept the previous video's channel

- **Symptom**: after SPA-navigating between videos, a single save recorded the correct video URL/title but the previously-opened video's channel name, channel URL, and avatar.
- **Root cause**: verified against production YouTube: SPA navigation re-renders the body but never rewrites the `ytInitialData` script tag or the head, while capture preferred `ytInitialData` for channel identity and fell back to head `link[itemprop]` elements — both frozen at the previous video. The modern owner DOM (attributed name link without href, avatar-view-model images) made the old DOM fallbacks dead on current pages.
- **Defense**: identity gate on `ytd-watch-flexy[video-id]` before reading, staleness check on `ytInitialData.currentVideoEndpoint` and the head's own canonical/og:url videoId, scoped head-fallback rules, and a post-read identity re-check. Pinned the fresh page shape as live fixture `watch-variant-d-collab-owner.html`.
