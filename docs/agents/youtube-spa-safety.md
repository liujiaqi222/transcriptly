# YouTube SPA batch safety

YouTube reuses one document while navigating between channels, playlists, and watch pages. DOM lifetime is therefore wider than the currently visible batch source.

## Invariants

- **Source identity**: key batch discovery and selection state by the current channel or playlist. A channel root and its `/videos` tab share one identity; another channel or playlist does not.
- **Source switch**: when SPA navigation changes that identity, clear discovered videos, selections, saved-status lookups, badges, and card markers before reading the new page.
- **Watch round trip**: a visit from a batch source to one of its watch pages and back may preserve selection because the batch source identity has not changed.
- **Target identity**: before either destination writes a Capture, require `capture.source.videoId` to equal the BatchVideo requested by the task. Treat a mismatch as a permanent failure.

## Regression contract

Every change in this area must keep these cases covered:

1. Select on channel A, navigate through YouTube's SPA to channel B, then Select all: the start request contains only channel B videos.
2. Select on a channel Videos tab, visit a watch page, then return to the same channel: the selection is restored.
3. Request video A and receive a Capture for video B: no local or cloud write runs, and the item reports a mismatch failure.

Run the focused batch page and tab-capture tests first, then the full extension tests, typecheck, production build, and `git diff --check`.

## Incident signature

- **Symptom**: Select all on one creator's channel saves videos from another creator.
- **Root cause**: source-scoped collections survived cross-channel SPA navigation, and the capture boundary did not independently enforce target video identity.
- **Defense**: reset on source-identity change and validate target identity at the final capture boundary. Either guard may catch a defect; both are required.
