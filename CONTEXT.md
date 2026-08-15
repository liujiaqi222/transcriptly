# Transcriptly

The domain model for the YouTube transcript knowledge platform: Capture → Store → Find → Publish.

## Language

**Capture**:
The product's single normalized representation of one save action — source metadata plus ordered transcript segments. The source of truth from which Markdown serialization and cloud upload both derive.
_Avoid_: snapshot, clip

**Source**:
The YouTube-side facts about a captured video (videoId, url, title, channel, description, publication date, transcript language, duration). Fixed facts about the video, distinct from the capture action itself.
_Avoid_: video metadata, page metadata

**Segment**:
One transcript entry — a text string plus its start time in integer seconds — ordered as rendered.
_Avoid_: cue, line, caption

**Chapter**:
A creator-defined section heading inside the transcript (YouTube chapters). Ordered by start time; rendered as a third-level heading in the Markdown output. Optional — most videos have none.
_Avoid_: section, part

**Capture boundary**:
The seam that isolates YouTube DOM scraping (the content script, the only code that touches the page) from the environment-neutral capture core.
_Avoid_: scraper, extractor

**Markdown serialization**:
The derived local artifact (frontmatter + source attribution + description + timestamped transcript) rendered from a Capture. Not part of the schema.
_Avoid_: export, dump

**Destination**:
Where a Capture is written — local (a Markdown file) or cloud (a private library item). At least one is required per capture.
_Avoid_: target, output
