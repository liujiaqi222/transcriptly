# Transcriptly Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who learn, research, or build from YouTube and want durable access to
the ideas inside videos, playlists, and creator channels. They capture while
browsing YouTube, keep ordinary files on their own computer, and may optionally
contribute complete transcripts to a public archive.

## Product Purpose

Transcriptly turns YouTube videos into timestamped Markdown knowledge. Success
means a user can capture one video or a whole playlist or channel, keep the
result locally without an account, use it with any text-based tool, and choose
separately whether to publish a complete capture for public search and reading.

## Positioning

The Chrome extension is the product's starting point, batch capture is its
strongest differentiator, and a local Markdown knowledge base is the primary
result. The public archive is an additive, explicitly contributed reading layer,
not the owner of a user's private library.

## Operating Context

- Capture starts from a YouTube watch page, playlist, or channel Videos tab.
- Local saves are Markdown files organized in a user-selected folder and work
  with Obsidian, VS Code, Codex, Claude Code, grep, and custom scripts.
- Batch work can be paused, resumed, and retried through the extension manager.
- Public contributions require a website session and an explicit disclosure;
  public readers do not need an account.

## Capabilities and Constraints

- Local save and public contribution are independent destinations. A failure in
  one must not roll back or obscure success in the other.
- A public contribution belongs to one user and one canonical YouTube video;
  the active publication selects the transcript currently visible to everyone.
- Only captures with a matching 11-character YouTube video ID, non-empty
  transcript, and valid monotonic timeline may be contributed.
- Public search, transcript pages, metadata, and sitemap read only active
  publications with a complete current transcript.
- Public attribution includes display name and an optional avatar, never email.
- Public pages use server-rendered transcript text and remain useful without
  client-side JavaScript or motion.

## Brand Commitments

- Product name: Transcriptly.
- Use the existing play-to-text logo source at `apps/extension/assets/logo.svg`.
- Voice is direct, concrete, and tool-like. Use Capture, Contribute publicly,
  Contributing, and Contributed for their distinct actions and states.
- Do not describe public contribution as Cloud Save, and do not imply local
  Markdown requires an account.
- Public website surfaces extend the established ink, blue-interaction, and
  yellow-primary-action identity documented in `docs/agents/visual-design.md`.

## Evidence on Hand

- Real selection and batch-manager states live in `apps/extension/batch/` and
  `apps/extension/entrypoints/manager/`.
- The real Markdown serializer lives in `packages/capture/src/serialize.ts`.
- The real logo asset lives in `apps/extension/assets/logo.svg`.
- Public archive content comes only from active publications in the database.
- No verified user counts, time-saved metrics, ratings, testimonials, or Chrome
  Web Store listing are available and they must not be fabricated.

## Product Principles

1. Local-first ownership is the default; cloud capability is additive.
2. Show the real workflow and real data structures instead of abstract claims.
3. Make batch capture immediately understandable as the key differentiator.
4. Require explicit consent for public contribution and preserve privacy
   boundaries at every read and write.
5. Prefer portable standards, accessible interaction, and recoverable state.

## Accessibility & Inclusion

Primary interactions must have accessible names, visible keyboard focus, and
adequate touch targets. Responsive layouts must preserve reading order without
horizontal overflow. Motion must respect `prefers-reduced-motion`, with all
meaningful content visible when animation is disabled or JavaScript is absent.
