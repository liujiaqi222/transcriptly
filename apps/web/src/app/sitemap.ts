import type { MetadataRoute } from "next";
import { getDatabase } from "@/db/client";
import { getAuthEnv } from "@/env/server";
import { listPublicTranscriptUrls } from "@/lib/publications/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAuthEnv().BETTER_AUTH_URL;
  const publicTranscripts = await listPublicTranscriptUrls(getDatabase());

  // Public surfaces only. Authentication and API routes never belong here.
  return [
    {
      url: `${baseUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...publicTranscripts.map((item) => ({
      url: `${baseUrl}/videos/${item.videoId}`,
      lastModified: item.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
