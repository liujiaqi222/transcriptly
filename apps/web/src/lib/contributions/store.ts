import type { Capture } from "@transcriptly/schema";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import {
  contributions,
  publicProfileConsents,
  publicPublications,
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
  outcome: "published" | "contributed" | "unchanged";
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
 * Stores the first public contribution atomically. Publication selection is
 * intentionally first-valid-capture-wins in #64; replacement ordering belongs
 * to #73 and must not be smuggled into this transaction.
 */
export async function storePublicContribution(
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
    const insertedPublication = insertedPublications[0];
    const [publication] = insertedPublication
      ? [insertedPublication]
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
      videoId: capture.source.videoId,
      outcome: insertedPublication
        ? "published"
        : insertedContribution
          ? "contributed"
          : "unchanged",
    };
  });
}
