# #73 Public Contribution replacement: latest qualified capture wins

Repeated public contributions converge on one current Public Publication per video. A newly received Capture replaces the current Transcript only after conservative, objective qualification; ordering is the server-received sequence, and older unreferenced Transcript content is pruned once the new Publication is durable.

## Considered options

- **Per-video advisory xact lock + last-committer-wins** (chosen): `storePublicContribution` already serialized first-publication writes with `pg_advisory_xact_lock(hashtext('public:' || videoId))`. Extending the same transaction to swap `public_publications.current_transcript_id` keeps replacement deterministic without comparing any client timestamp and without new columns.
- **Explicit `received_seq` counter stored on the publication**: more auditable on paper, but under the lock the newer sequence number always wins anyway - the column would never participate in a decision, only add migration surface.
- **Client `capturedAt` ordering**: rejected; client clocks are untrusted by contract (#28), and the issue requires the server-received sequence.

## Qualification

Qualification is objective and structural only, reported with specific 422 codes: `target_video_mismatch`, `empty_transcript`, `invalid_timeline`, `duplicate_transcript` (the segment sequence repeated exactly end to end - a provable capture-side artifact that the extension logs loudly as its own bug). Language, length, and prose style are never scored. A rejected Public Contribution never touches the transaction; an independently selected Local destination is unaffected because the extension runs Local and Cloud as separate saves (#64).

## Consequences

- `(user_id, video_id)` remains the Contribution idempotency boundary: a Contribution has no Transcript foreign key, so #74's withdrawal lifecycle can remove contributors without unpicking content versions.
- Outcomes extend to `replaced`; identical content hashes stay idempotent (`unchanged`) with zero churn - including attribution, which follows the current Transcript's contributor.
- A replacement also reactivates an inactive publication, so a video unpublished by #74's final-withdrawal can be republished by a fresh qualified contribution.
- Pruning (`pruneUnreferencedTranscripts`) runs after the transaction commits and deletes only transcripts referenced by no publication row for the video; a prune failure is logged, never surfaced to the contributor.
