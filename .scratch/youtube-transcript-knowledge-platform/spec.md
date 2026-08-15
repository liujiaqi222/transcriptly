# YouTube Transcript Knowledge Platform MVP

**Status:** ready-for-agent

## Problem Statement

People use long YouTube videos to learn, research, and collect ideas, but the useful knowledge remains trapped inside the playback timeline. YouTube exposes a transcript on many video pages, yet turning that transcript into a durable local artifact still takes work, and finding a specific idea across previously saved videos is harder than remembering that a video once mentioned it.

Existing web clippers prove that a browser extension can capture a YouTube transcript and save useful Markdown. This product should retain that simple, user-friendly capture experience while going further: every capture must belong to the user locally, and the user may also opt into a cloud library that supports cross-video search, sharing, public publishing, and search-engine-indexable transcript pages.

The product must not require a local AI runtime, vector database, companion application, or MCP server. Local files should be useful with ordinary tools such as Obsidian, editors, `rg`, `grep`, and local coding agents. Computationally heavier indexing belongs in the optional cloud service.

## Solution

Build an open-source browser extension and a standalone website around one normalized YouTube transcript capture.

When a user opens a YouTube video and clicks the extension, the extension finds the page's Transcript section, opens it automatically when necessary, and reads the transcript segments that YouTube has rendered for the user. It combines those segments with the video's title, channel, source URL, description, language when available, and other useful page metadata.

Every capture offers an agent-friendly local Markdown destination, selected by default and available without an account. A signed-in user may also select the cloud destination. Local and cloud are independent, compatible options: the user may save locally, save to the cloud, or select both, with at least one destination required.

Cloud captures are private by default. The cloud service stores and indexes transcript segments so the user can search across saved videos and receive exact, source-grounded transcript passages with timestamps. A user may explicitly publish selected cloud items. Published items receive public video pages containing the source video, description, structured transcript, and timestamp navigation, with server-rendered SEO metadata and inclusion in public discovery surfaces.

The first version uses the video's existing description rather than generating a separate AI summary. AI-generated summaries, knowledge graphs, word clouds, and other enrichment may be added later, but they are not required to prove the core Capture -> Store -> Find -> Publish loop.

## User Stories

1. As a YouTube viewer, I want to install a focused browser extension, so that I can save useful videos without changing my normal viewing workflow.
2. As an anonymous user, I want to use the extension without creating an account, so that I can evaluate the core capture feature with minimal friction.
3. As a viewer on a YouTube watch page, I want the extension to detect the current video, so that I do not have to paste a URL or repeat its metadata.
4. As a viewer, I want the extension to find the Transcript section automatically, so that I do not have to copy subtitle text manually.
5. As a viewer, I want the extension to open a collapsed or hidden Transcript section after I click Save, so that capture remains a one-action workflow.
6. As a viewer, I want a clear failure message when the page has no accessible transcript, so that I understand why the video cannot be captured.
7. As a viewer, I want the extension to capture the transcript track currently exposed by YouTube, so that the saved result matches what I can see on the page.
8. As a viewer, I want each transcript segment to retain its timestamp, so that I can return to the exact moment in the source video.
9. As a viewer, I want the video title, channel, URL, description, publication metadata, capture date, and available language metadata preserved, so that the transcript remains understandable outside YouTube.
10. As a viewer, I want a short capture preview or status, so that I can see which video and transcript are being saved.
11. As a local-first user, I want local Markdown selected as the default destination, so that owning a readable copy is the easiest path.
12. As a local-first user, I want local saving to work without login or cloud access, so that the base product does not depend on the hosted service.
13. As an Obsidian user, I want the Markdown to contain useful frontmatter and readable headings, so that I can place it in a vault without extensive cleanup.
14. As an editor user, I want the Markdown transcript to be plain and predictable, so that any Markdown-capable application can display it.
15. As a coding-agent user, I want transcript text to remain ordinary searchable text, so that local agents can use `rg`, `grep`, and file reads without a custom integration.
16. As a user, I want timestamp labels in the Markdown to link back to the matching YouTube position, so that verifying context is fast.
17. As a user, I want the local file to include the existing YouTube description, so that the creator-provided overview remains with the transcript.
18. As a user, I want saving the same video again to have predictable behavior, so that I do not silently lose an older local file or create confusing cloud duplicates.
19. As a privacy-conscious user, I want local saving to happen without uploading the transcript, so that local use remains genuinely local.
20. As a registered user, I want to sign into the cloud service from the extension or website, so that captures can be associated with my private library.
21. As a registered user, I want cloud saving to remain optional on every capture, so that signing in does not turn every local save into an upload.
22. As a registered user, I want to select local saving and cloud saving together, so that I do not have to choose between ownership and cloud convenience.
23. As a registered user, I want the extension to remember my previous cloud-save preference, so that repeated captures require less interaction.
24. As a registered user, I want immediate confirmation that the local file was saved even while cloud processing continues, so that network latency does not block the core action.
25. As a registered user, I want cloud upload failures to leave the local Markdown intact, so that an optional service failure cannot destroy the capture.
26. As a registered user, I want uploaded captures to be private by default, so that collecting a video never publishes my activity accidentally.
27. As a registered user, I want a web library of my cloud-saved videos, so that I can browse them from a standalone website.
28. As a registered user, I want each library item to show its video identity, channel, description, transcript availability, and processing state, so that I can understand what has been saved.
29. As a registered user, I want to open a cloud video page and read its transcript with timestamps, so that I can review the content without reopening YouTube first.
30. As a registered user, I want to search exact words and names across my cloud transcripts, so that precise terminology is easy to find.
31. As a registered user, I want cloud semantic search across transcript segments, so that I can find an idea even when my query does not reuse the video's exact wording.
32. As a registered user, I want search results to identify the matching video and exact transcript passage, so that results remain grounded in source material.
33. As a registered user, I want enough surrounding transcript context in each result, so that I can judge relevance before opening the video.
34. As a registered user, I want a search result's timestamp to open the source video at the relevant moment, so that I can verify the result immediately.
35. As a registered user, I want private search to exclude other users' private captures, so that cloud indexing never leaks private content.
36. As a user, I want public and private search scopes to be visibly distinct, so that I know which corpus I am querying.
37. As a user, I want to search the site's public transcript corpus, so that I can discover useful videos captured and published by other users.
38. As a publisher, I want to explicitly publish an individual cloud item, so that I control which captures become public.
39. As a publisher, I want to preview the public page before publishing, so that I can catch incorrect metadata or transcript extraction.
40. As a publisher, I want a public page to include the source video, creator attribution, description, transcript, and timestamp navigation, so that readers can inspect and verify the original source.
41. As a publisher, I want a stable shareable URL for each public video page, so that I can link it from other sites or social media.
42. As a publisher, I want to unpublish a page, so that I can remove it from public access without deleting my private cloud copy.
43. As a publisher, I want deletion controls for my cloud copy, so that I retain control over hosted data.
44. As a public visitor, I want public transcript pages to load without an account, so that shared links and search-engine results are useful.
45. As a public visitor, I want transcript timestamps to navigate to the original YouTube video, so that the public page does not obscure the source.
46. As a public visitor, I want readable page structure and navigation, so that long transcripts remain usable on mobile and desktop.
47. As a search-engine user, I want public pages to have accurate titles and descriptions, so that search results communicate the video's subject.
48. As a site operator, I want private pages excluded from indexing, so that private captures never appear in search engines.
49. As a site operator, I want only successfully published pages included in sitemaps and public discovery, so that crawlers do not index empty or processing pages.
50. As a site operator, I want canonical public URLs for video pages, so that duplicate routes do not fragment search signals.
51. As a site operator, I want public pages to remain useful without client-side JavaScript, so that crawlers and readers receive the core content reliably.
52. As a site operator, I want captured page data treated as untrusted input, so that YouTube text cannot inject markup or scripts into local previews or public pages.
53. As a site operator, I want observability around capture, upload, indexing, search, and publication failures, so that the core journey can be maintained when YouTube changes its page.
54. As an open-source contributor, I want capture logic isolated from product UI and cloud code, so that YouTube DOM changes can be fixed without rewriting the application.
55. As an open-source contributor, I want representative YouTube fixtures, so that extraction changes can be tested without depending on live YouTube during every test run.
56. As an open-source user, I want the local export feature to remain usable independently from the hosted service, so that the project is valuable even without the commercial cloud.

## Implementation Decisions

- The product is a greenfield system composed of a browser extension and a standalone website/cloud service.
- The browser extension is the primary capture entry point. Capturing a transcript is a core product capability even though other open-source clippers provide similar extraction.
- The extension reads the Transcript section rendered on the current YouTube page. It does not use the YouTube Data API, OAuth caption download, a third-party transcript provider, audio download, or speech-to-text for this MVP.
- A user action initiates capture. The extension does not automatically record every watched video.
- If the Transcript section is not currently open, the extension attempts to open it and waits for rendered transcript segments. If automation fails, the UI may instruct the user to open the section manually and retry.
- Capture logic normalizes page-specific DOM into a stable product representation: video metadata, description, transcript language when exposed, and ordered transcript segments containing text and start time.
- YouTube DOM selectors and normalization are isolated behind one capture boundary so page changes have a narrow maintenance surface.
- Page content is untrusted. Text and metadata are parsed and sanitized before preview, Markdown serialization, cloud storage, or public rendering.
- Local Markdown is selected by default and does not require authentication. An authenticated user may select local only, cloud only, or both; the capture action requires at least one destination.
- Local Markdown is the durable user-owned artifact. It includes frontmatter, source attribution, the existing video description, and a readable timestamped transcript suitable for Obsidian, editors, command-line search, and coding agents.
- Local storage does not include embeddings or a vector database. No local companion application or MCP server is required.
- Cloud save is available only as an explicit option for authenticated users and can be selected together with local save.
- The extension keeps local save selected by default and may remember the user's most recent cloud-save preference.
- Local completion and cloud completion are separate states. A failed cloud upload must not turn a successful local download into a failed capture.
- The same normalized capture representation drives Markdown serialization and cloud upload so the two optional outputs cannot drift semantically.
- Cloud ingestion is idempotent for a user and YouTube video identity. Repeated uploads update or reuse the user's cloud item without creating uncontrolled duplicate private entries; local filename collision behavior remains browser-safe and non-destructive.
- Cloud items are private by default. Publication is a separate, explicit state transition.
- The cloud stores canonical video metadata separately from user ownership and publication state, allowing repeated captures of the same source to be handled consistently while preserving each user's private library relationship.
- Transcript segments retain start times as integer seconds and preserve source order. Search results and public pages build YouTube timestamp links from these values.
- Cloud indexing is derived data. The original normalized transcript remains the source from which full-text and semantic indexes can be rebuilt.
- Cloud search combines exact-text retrieval with semantic retrieval over transcript segments. Search results return source-grounded passages rather than generated answers.
- Search scope is explicit: a user's private library and the public corpus are separate scopes. Authorization is applied before retrieval so private segments cannot enter another user's result set.
- The video's existing description serves as the initial summary-like content. The MVP does not automatically generate a second AI summary.
- A cloud video page shows the embedded or linked source video, creator attribution, description, transcript, and timestamp navigation.
- Publication creates a public, unauthenticated page. Unpublishing removes public access and indexing eligibility without requiring deletion of the owner's private cloud item.
- Public pages are server-rendered or statically generated with meaningful HTML content. Public pages receive unique metadata, canonical URLs, and sitemap eligibility; private and incomplete pages are marked non-indexable and omitted from sitemaps.
- The public page must link clearly to the original YouTube source and must not imply ownership of the source video or transcript.
- The open-source implementation may learn from compatible open-source projects such as Obsidian Web Clipper, but it must retain its own product identity and respect third-party licenses, trademarks, and asset restrictions.
- The initial product should feel complete around Capture -> Store -> Find -> Publish. Additional visualizations and generative transformations are extensions of that loop, not prerequisites for shipping it.

## Testing Decisions

- Tests assert externally visible behavior rather than DOM helper functions, internal state shapes, framework components, or database implementation details.
- The highest and primary test seam is a browser-level capture contract built around representative YouTube page fixtures. Given a watch page whose Transcript section is initially collapsed, one Save action must open the section, capture ordered timestamped segments, produce the expected local Markdown when the local destination is selected, and emit the same normalized capture to the cloud when an authenticated user selects the cloud destination.
- The primary seam also covers failure behavior: no transcript, malformed transcript segments, a YouTube layout change that prevents extraction, local success with cloud failure, and untrusted text that must remain inert.
- Fixture coverage includes at least an ordinary manually captioned video, an automatically captioned video, a long transcript, a transcript containing CJK text, and a page with no Transcript section.
- Markdown tests compare semantic output: required metadata, description, segment order, timestamp links, and text. They should avoid snapshots of incidental whitespace or extension UI markup.
- Cloud ingestion tests exercise the public API boundary and verify authentication, idempotent repeated capture, private-by-default state, segment ordering, and independent local/cloud outcomes.
- Search tests use deterministic stored segments and assert that exact and semantic queries return the expected source passage, video identity, context, and timestamp while respecting private/public authorization boundaries.
- Publication tests exercise the highest web boundary: a private item is inaccessible publicly and excluded from indexing; publishing makes a content-complete page and SEO metadata available; unpublishing removes public access while preserving the owner's private item.
- SEO tests inspect rendered HTML, canonical metadata, robots directives, and sitemap inclusion. They do not test search-engine ranking.
- Because the repository is currently empty, there is no existing test prior art to preserve. The implementation should prefer one browser automation framework for both the extension capture journey and public website behavior where practical, supplemented only by focused API tests where browser setup would obscure authorization or indexing behavior.
- Live YouTube smoke checks may complement fixtures before releases, but normal automated tests must not depend on YouTube availability or its current production DOM.

## Out of Scope

- Automatically capturing every video a user watches.
- Downloading YouTube video or audio files.
- Running speech-to-text when YouTube does not expose a transcript.
- Using the official YouTube caption download API, OAuth caption ownership flows, or a third-party transcript service.
- Local embedding generation, a local vector database, a native companion process, or an MCP server.
- Making a public website read arbitrary files directly from the user's machine.
- AI-generated summaries as a required part of capture.
- Generated answers or chat over the transcript corpus; initial search returns source passages.
- Knowledge graphs, force-directed visualizations, word clouds, keyword-density dashboards, and entity graphs.
- Automated article, newsletter, study-guide, or blog generation.
- Team workspaces, collaborative editing, comments, and organization billing.
- Bulk channel ingestion, playlist ingestion, or background crawling independent of an explicit user capture.
- Native mobile applications and non-browser capture clients.
- Guaranteed search ranking outcomes. The MVP provides technically sound, indexable public pages but cannot promise rankings or traffic.

## Further Notes

- Product posture: user-friendly and feature-capable rather than narrowly agent-only. Local agent compatibility is achieved through ordinary Markdown instead of a proprietary agent integration.
- Product loop: Capture -> Store -> Find -> Publish.
- Local and cloud are parallel destinations. "Local-first" means local export is available without login and selected by default, while cloud upload is explicit; it does not prevent a user from selecting both.
- Public SEO depends on explicit publication. Content that exists only in a local file or private cloud library cannot be indexed by public search engines.
- The first implementation should use realistic transcript fixtures derived from pages the user is authorized to view, with any fixture content kept short enough to avoid unnecessary redistribution.
- Public transcript hosting introduces copyright, removal, and platform-policy considerations. Before broad launch, the product needs a takedown path, publication terms, and a decision about whether public pages may expose full transcripts or only value-added excerpts plus source links.
- Multiple transcript-language selection, cloud pricing, free quotas, retention limits, public collection pages, and self-hosting packaging remain future product decisions. The data model should not unnecessarily block them, but this spec does not decide their UX.
- The first UI prototype should focus on the extension capture state and make local completion, optional cloud selection, transcript availability, and errors visible. Prototype code is throwaway and should not be promoted directly into production.
