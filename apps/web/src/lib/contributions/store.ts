import type { Capture } from "@transcriptly/schema";
import { and, asc, eq, ne, notInArray, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  canonicalVideos,
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

export type PublicWithdrawalOutcome = {
  videoId: string;
  /** Canonical Video row id; the pruning seam, not part of the API contract. */
  canonicalVideoId: string;
  outcome: "withdrawn" | "unpublished";
  remainingContributors: number;
};

/** The user has no Contribution for that video (or the video is unknown). */
export class ContributionNotFoundError extends Error {
  readonly code = "contribution_not_found";

  constructor() {
    super("No contribution was found for this video.");
    this.name = "ContributionNotFoundError";
  }
}

/**
 * Withdraw the current user's video-level Contribution (#74). The
 * Contribution belongs to the video, not to a Transcript version: removing
 * one contributor removes only their attribution. When other contributors
 * remain, the Publication and current Transcript stay untouched and the
 * attribution falls back to the earliest remaining contributor. When the
 * final contributor leaves, the Publication row is deleted - the video is
 * unpublished - and every Transcript for the video is pruned afterwards.
 *
 * Shares the per-video advisory lock with contributePublicly so a
 * withdrawal racing a new contribution still converges deterministically.
 */
export async function withdrawContribution(
  db: Database,
  userId: string,
  youtubeVideoId: string,
): Promise<PublicWithdrawalOutcome> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('public:' || ${youtubeVideoId}))`,
    );

    const [video] = await tx
      .select({ id: canonicalVideos.id })
      .from(canonicalVideos)
      .where(eq(canonicalVideos.youtubeVideoId, youtubeVideoId))
      .limit(1);
    if (!video) return { notFound: true as const };

    const [own] = await tx
      .select({ id: contributions.id })
      .from(contributions)
      .where(
        and(
          eq(contributions.userId, userId),
          eq(contributions.videoId, video.id),
        ),
      )
      .limit(1);
    if (!own) return { notFound: true as const };

    const remaining = await tx
      .select({ id: contributions.id })
      .from(contributions)
      .where(
        and(
          eq(contributions.videoId, video.id),
          ne(contributions.userId, userId),
        ),
      )
      .orderBy(asc(contributions.createdAt), asc(contributions.id));

    const [publication] = await tx
      .select({
        id: publicPublications.id,
        contributionId: publicPublications.contributionId,
      })
      .from(publicPublications)
      .where(eq(publicPublications.videoId, video.id))
      .limit(1);

    if (remaining.length === 0) {
      // Final contributor: unpublish by deleting the Publication (the FK on
      // current_transcript_id is restrict, so the row must go before the
      // Transcript can be pruned). A later contribution re-inserts it.
      if (publication) {
        await tx
          .delete(publicPublications)
          .where(eq(publicPublications.id, publication.id));
      }
      await tx.delete(contributions).where(eq(contributions.id, own.id));
      return {
        outcome: "unpublished" as const,
        remainingContributors: 0,
        canonicalVideoId: video.id,
      };
    }

    // Attribution follows the withdrawn Contribution only when it currently
    // carries it; otherwise the Publication is left exactly as it is.
    if (publication?.contributionId === own.id) {
      await tx
        .update(publicPublications)
        .set({
          contributionId: remaining[0].id,
          updatedAt: sql`now()`,
        })
        .where(eq(publicPublications.id, publication.id));
    }
    await tx.delete(contributions).where(eq(contributions.id, own.id));
    return {
      outcome: "withdrawn" as const,
      remainingContributors: remaining.length,
      canonicalVideoId: video.id,
    };
  });

  if ("notFound" in result) throw new ContributionNotFoundError();

  if (result.outcome === "unpublished") {
    await pruneSafely(db, result.canonicalVideoId, youtubeVideoId);
  }

  return {
    videoId: youtubeVideoId,
    canonicalVideoId: result.canonicalVideoId,
    outcome: result.outcome,
    remainingContributors: result.remainingContributors,
  };
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
 * Prune after the durable outcome commits. A pruning failure is logged,
 * never surfaced to the client - the contribution or withdrawal itself is
 * already durable.
 */
async function pruneSafely(
  db: Database,
  canonicalVideoId: string,
  youtubeVideoId: string,
): Promise<void> {
  try {
    await pruneUnreferencedTranscripts(db, canonicalVideoId);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "transcript_prune_failed",
        videoId: youtubeVideoId,
        canonicalVideoId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
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
  await pruneSafely(db, result.canonicalVideoId, result.videoId);
  return result;
}
