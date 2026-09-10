import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  FeaturePage,
  featureMetadata,
  isFeatureSlug,
} from "@/components/seo/feature-page";

export function generateStaticParams() {
  return [
    { feature: "youtube-playlist-transcript-downloader" },
    { feature: "youtube-channel-transcript-downloader" },
    { feature: "youtube-transcript-to-markdown" },
    { feature: "youtube-transcript-for-obsidian" },
  ];
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ feature: string }>;
}): Promise<Metadata> {
  return params.then(({ feature }) =>
    isFeatureSlug(feature) ? featureMetadata(feature) : {},
  );
}

export default async function FeatureRoute({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = await params;
  if (!isFeatureSlug(feature)) notFound();
  return <FeaturePage slug={feature} />;
}
