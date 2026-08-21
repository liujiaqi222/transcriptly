import type { MetadataRoute } from "next";
import { getAuthEnv } from "@/env/server";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAuthEnv().BETTER_AUTH_URL;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The private saved area and machine surfaces never belong to a
        // search index, even if a URL leaks (#37).
        disallow: ["/saved", "/sign-in", "/api"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
