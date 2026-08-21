import type { MetadataRoute } from "next";
import { getAuthEnv } from "@/env/server";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAuthEnv().BETTER_AUTH_URL;

  // Public surfaces only. Everything under /saved is private and per-user,
  // so it must never appear here (#37).
  return [
    {
      url: `${baseUrl}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
