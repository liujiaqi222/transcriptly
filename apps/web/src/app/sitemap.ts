import type { MetadataRoute } from "next";
import { getDatabase } from "@/db/client";
import { getAuthEnv } from "@/env/server";
import { listChannels } from "@/lib/channels/queries";
import { listPublicTranscriptUrls } from "@/lib/publications/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAuthEnv().BETTER_AUTH_URL;
  const db = getDatabase();
  const [publicTranscripts, channels] = await Promise.all([
    listPublicTranscriptUrls(db),
    listChannels(db),
  ]);

  // Public surfaces only. Authentication and API routes never belong here.
  return [
    {
      url: `${baseUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/transcripts`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/channels`,
      changeFrequency: "daily",
      priority: 0.7,
    },
    ...channels.map((channel) => ({
      url: `${baseUrl}/channels/${channel.slug}`,
      lastModified: channel.latestPublicationAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...publicTranscripts.map((item) => ({
      url: `${baseUrl}/transcripts/${item.videoId}`,
      lastModified: item.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
