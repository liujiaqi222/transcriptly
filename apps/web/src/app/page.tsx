import type { Metadata } from "next";
import { headers } from "next/headers";
import { LandingPage } from "@/components/landing/landing-page";
import { getDatabase } from "@/db/client";
import { auth } from "@/lib/auth/auth";
import { listPublicTranscripts } from "@/lib/publications/queries";
import { searchPublicArchive } from "@/lib/search/search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transcriptly — Turn YouTube into a knowledge base",
  description:
    "Capture videos, playlists, and channels as timestamped Markdown. Keep a local knowledge base and optionally contribute to a public transcript archive.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Transcriptly — Turn YouTube into a knowledge base",
    description:
      "Capture YouTube transcripts in batch and keep them locally as portable Markdown.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Transcriptly — Turn YouTube into a knowledge base",
    description:
      "Capture YouTube transcripts in batch and keep them locally as portable Markdown.",
  },
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim().slice(0, 200) ?? "";
  const db = getDatabase();
  const requestHeaders = await headers();
  const [publicItems, search, session] = await Promise.all([
    listPublicTranscripts(db, 4),
    query ? searchPublicArchive(db, query) : Promise.resolve(null),
    auth.api.getSession({ headers: requestHeaders }),
  ]);

  return (
    <LandingPage
      signedIn={Boolean(session)}
      query={query}
      publicItems={publicItems}
      search={search}
    />
  );
}
