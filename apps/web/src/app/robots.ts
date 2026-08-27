import type { MetadataRoute } from "next";
import { getAuthEnv } from "@/env/server";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAuthEnv().BETTER_AUTH_URL;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authentication and machine surfaces never belong to a search index.
        disallow: ["/sign-in", "/api"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
