import type { Capture } from "@transcriptly/schema";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  contributions,
  publicProfileConsents,
  publicPublications,
  transcripts,
} from "../../db/schema";
import { transcriptContentHash } from "../captures/hash";
import {
  findOrCreateTranscript,
  updateCanonicalVideo,
} from "../captures/store";

export class PublicConfirmationRequiredError extends Error {
  readonly code = "public_confirmation_required";

  constructor() {
    super(
      "Confirm that the transcript, your display name, and optional avatar will be public.",
    );
    this.name = "PublicConfirmationRequiredError";
  }
}

export type PublicContributionOutcome = {
  contributionId: string;
  videoId: string;
  /** Canonical Video row id; the pruning seam, not part of the API contract. */
  canonicalVideoId: string;
  outcome: "published" | "contributed" | "replaced" | "unchanged";
  publicationId: string;
  currentTranscriptId: string;
};

export async function getPublicConsent(
  db: Database,
  userId: string,
): Promise<{ confirmedAt: Date } | null> {
  const [row] = await db
    .select({ confirmedAt: publicProfileConsents.confirmedAt })
    .from(publicProfileConsents)
    .where(eq(publicProfileConsents.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Repeated public contributions converge on one current Public Publication
 * per video (#73). Ordering is the server-received sequence: the per-video
 * advisory lock serializes transactions, so the last transaction to acquire
 * the lock commits the current version. No client timestamp participates in
 * the decision.
 *
 * Module-private transaction seam: contributePublicly is the only entry
 * point. If a store-level test ever needs to call this directly, re-export
 * it then - not before.
 */
async function storePublicContribution(
  db: Database,
  userId: string,
  capture: Capture,
  capturedAt: Date,
  confirmPublicProfile: boolean,
): Promise<PublicContributionOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('public:' || ${capture.source.videoId}))`,
    );

    const [consent] = await tx
      .select({ userId: publicProfileConsents.userId })
      .from(publicProfileConsents)
      .where(eq(publicProfileConsents.userId, userId))
      .limit(1);
    if (!consent && !confirmPublicProfile) {
      throw new PublicConfirmationRequiredError();
    }
    if (!consent) {
      await tx
        .insert(publicProfileConsents)
        .values({ userId })
        .onConflictDoNothing({ target: publicProfileConsents.userId });
    }

    const videoId = await updateCanonicalVideo(tx, capture, capturedAt);
    const transcriptId = await findOrCreateTranscript(
      tx,
      videoId,
      capture,
      transcriptContentHash(capture),
    );

    const insertedContributions = await tx
      .insert(contributions)
      .values({ userId, videoId })
      .onConflictDoNothing({
        target: [contributions.userId, contributions.videoId],
      })
      .returning({ id: contributions.id });
    const insertedContribution = insertedContributions[0];
    const [existingContribution] = insertedContribution
      ? [insertedContribution]
      : await tx
          .select({ id: contributions.id })
          .from(contributions)
          .where(
            and(
              eq(contributions.userId, userId),
              eq(contributions.videoId, videoId),
            ),
          )
          .limit(1);
    if (!existingContribution)
      throw new Error("Contribution was not available.");

    const insertedPublications = await tx
      .insert(publicPublications)
      .values({
        videoId,
        currentTranscriptId: transcriptId,
        contributionId: existingContribution.id,
        source: "contribution",
        active: true,
      })
      .onConflictDoNothing({ target: publicPublications.videoId })
      .returning({
        id: publicPublications.id,
        currentTranscriptId: publicPublications.currentTranscriptId,
      });

    // First publication for the video: nothing to replace.
    if (insertedPublications[0]) {
      return {
        contributionId: existingContribution.id,
        publicationId: insertedPublications[0].id,
        currentTranscriptId: insertedPublications[0].currentTranscriptId,
        canonicalVideoId: videoId,
        videoId: capture.source.videoId,
        outcome: "published",
      };
    }

    // Latest qualified capture wins: swap the current Transcript (and the
    // attribution to its contributor) whenever the content hash differs. A
    // reactivating replacement also restores `active = true` so a video
    // unpublished by a future withdrawal can be republished. An identical
    // content hash is idempotent: the Publication stays untouched.
    const updatedPublications = await tx
      .update(publicPublications)
      .set({
        currentTranscriptId: transcriptId,
        contributionId: existingContribution.id,
        active: true,
        publishedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(publicPublications.videoId, videoId),
          ne(publicPublications.currentTranscriptId, transcriptId),
        ),
      )
      .returning({
        id: publicPublications.id,
        currentTranscriptId: publicPublications.currentTranscriptId,
      });

    const [publication] = updatedPublications[0]
      ? [updatedPublications[0]]
      : await tx
          .select({
            id: publicPublications.id,
            currentTranscriptId: publicPublications.currentTranscriptId,
          })
          .from(publicPublications)
          .where(eq(publicPublications.videoId, videoId))
          .limit(1);
    if (!publication) throw new Error("Public Publication was not available.");

    return {
      contributionId: existingContribution.id,
      publicationId: publication.id,
      currentTranscriptId: publication.currentTranscriptId,
      canonicalVideoId: videoId,
      videoId: capture.source.videoId,
      outcome: updatedPublications[0]
        ? "replaced"
        : insertedContribution
          ? "contributed"
          : "unchanged",
    };
  });
}

/**
 * Remove older Transcript content for a video once the new current
 * Publication is durable (#73). Only unreferenced rows are deleted - the
 * current Transcript of any remaining Publication row (including an
 * inactive one) is retained. Pruning runs after the transaction commits and
 * must never fail the contribution itself.
 */
export async function pruneUnreferencedTranscripts(
  db: Database,
  canonicalVideoId: string,
): Promise<number> {
  const referenced = db
    .select({ id: publicPublications.currentTranscriptId })
    .from(publicPublications)
    .where(eq(publicPublications.videoId, canonicalVideoId));
  const deleted = await db
    .delete(transcripts)
    .where(
      and(
        eq(transcripts.videoId, canonicalVideoId),
        notInArray(transcripts.id, referenced),
      ),
    )
    .returning({ id: transcripts.id });
  return deleted.length;
}

/**
 * The route-facing entry point: commit the latest-qualified contribution,
 * then prune. A pruning failure is logged, never surfaced to the client -
 * the contribution itself is already durable.
 */
export async function contributePublicly(
  db: Database,
  userId: string,
  capture: Capture,
  capturedAt: Date,
  confirmPublicProfile: boolean,
): Promise<PublicContributionOutcome> {
  const result = await storePublicContribution(
    db,
    userId,
    capture,
    capturedAt,
    confirmPublicProfile,
  );
  try {
    await pruneUnreferencedTranscripts(db, result.canonicalVideoId);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "transcript_prune_failed",
        videoId: result.videoId,
        canonicalVideoId: result.canonicalVideoId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  return result;
}
