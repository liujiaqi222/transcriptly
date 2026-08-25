# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Transcriptly serves heavy learners, researchers, and creators who continuously
extract knowledge from large volumes of YouTube videos.

## Product Purpose

Turn the current YouTube video, channel, or playlist into captures inside the
user's own searchable knowledge library with as little interruption as
possible.

## Positioning

Transcriptly combines immediate single-video capture with batch collection from
the YouTube page the user is already browsing. The same capture can remain a
plain local Markdown file, become a private cloud library item, or both.

## Operating Context

Users invoke Transcriptly from a browser popup while watching a video or
browsing a channel or playlist. Batch selection controls appear on YouTube only
when requested. Users may return repeatedly throughout a study or research
session.

## Capabilities and Constraints

- Single-video and batch capture must remain equally easy to discover.
- Local Markdown is available without sign-in and remains enabled by default.
- Cloud is optional, private, and requires a signed-in session.
- YouTube SPA navigation must never mix source or target video identity.
- The popup is a compact browser-extension surface, not a destination app.

## Brand Commitments

The product name is Transcriptly. Its interface should feel quiet, direct, and
purpose-built for repeated knowledge collection rather than like a generic AI
SaaS dashboard.

## Evidence on Hand

The repository contains production popup, content-script batch selection, local
save, cloud queue, and real Chrome MV3 end-to-end coverage.

## Product Principles

- Capture first: the primary action is immediately obvious.
- Stay out of the way: repeated use should feel lightweight.
- Preserve ownership: local Markdown and cloud remain independent choices.
- Reveal complexity only when the current task requires it.
- Keep every YouTube source and target identity explicit and safe.

## Accessibility & Inclusion

All actionable controls retain text labels, keyboard focus, sufficient contrast,
and touch-friendly pointer targets.
