import type { MetadataRoute } from "next";
import { getAuthEnv } from "@/env/server";

// Keep robots in sync with the runtime BETTER_AUTH_URL (same as sitemap.ts);
// a build-time render would bake whatever URL the CI build args carried.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAuthEnv().BETTER_AUTH_URL;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authentication and machine surfaces never belong to a search index.
        disallow: ["/sign-in", "/contributions", "/api"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
